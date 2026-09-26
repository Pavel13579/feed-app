import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useSubmit, useNavigation, useActionData, useLoaderData } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Text,
  Banner,
  List,
  Badge,
  TextField,
} from "@shopify/polaris";
import { generateFeed } from "app/models/feed.server";
import { authenticateFeedRequest } from "app/models/feedAccess.server";
import { DeleteFeedModal } from "app/components/DeleteFeedModal";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { feed, adapter } = await authenticateFeedRequest(request, params.feedId);

  const appUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;

  return json({
    feed: {
      id: feed.id,
      name: feed.name,
      lastGeneratedAt: feed.lastGeneratedAt,
      itemCount: feed.itemCount,
    },
    channel: adapter.descriptor,
    feedUrl: `${appUrl}/feed/${feed.token}/${adapter.filename}`,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { feed } = await authenticateFeedRequest(request, params.feedId);

  try {
    const updatedFeed = await generateFeed(feed.id);
    const xmlSizeBytes = Buffer.byteLength(updatedFeed.content || "", "utf8");
    const xmlSizeKb = (xmlSizeBytes / 1024).toFixed(2);

    return json({
      success: true as const,
      message: "Feed successfully updated",
      feed: {
        itemCount: updatedFeed.itemCount,
        errorCount: updatedFeed.errorCount,
        warningCount: updatedFeed.warningCount,
        healthScore: updatedFeed.healthScore,
        lastGeneratedAt: updatedFeed.lastGeneratedAt,
        sizeKb: xmlSizeKb,
        preview: updatedFeed.content ? updatedFeed.content.substring(0, 500) + "..." : "",
      },
    });
  } catch (error: any) {
    return json(
      {
        success: false as const,
        message: `Generation failed: ${error.message}`,
        feed: null,
      },
      { status: 500 },
    );
  }
};

export default function FeedPage() {
  const submit = useSubmit();
  const navigation = useNavigation();
  const actionData = useActionData<typeof action>();
  const { feed, channel, feedUrl } = useLoaderData<typeof loader>();

  const [isCopied, setIsCopied] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const isLoading = navigation.state === "submitting";

  const handleSync = () => {
    submit(null, { method: "POST" });
  };

  const handleCopyUrl = useCallback(async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setIsCopied(true);

      if (typeof shopify !== "undefined" && shopify.toast) {
        shopify.toast.show("Link copied");
      }

      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy feed URL:", error);

      if (typeof shopify !== "undefined" && shopify.toast) {
        shopify.toast.show("Could not copy link — please copy it manually", { isError: true });
      }
    }
  }, [feedUrl]);

  return (
    <Page
      title={feed.name}
      subtitle={channel.label}
      backAction={{ content: "Feeds", url: "/app/feeds" }}
      secondaryActions={[
        { content: "Settings", url: `/app/feeds/${feed.id}/settings` },
        { content: "Health", url: `/app/feeds/${feed.id}/health` },
        { content: "Delete", destructive: true, onAction: () => setShowDelete(true) },
      ]}
    >
      <Layout>
        <Layout.Section>
          {actionData?.success && actionData.feed && (
            <div style={{ marginBottom: "16px" }}>
              <Banner title="Feed Generated Successfully" tone="success">
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    {actionData.message}
                  </Text>
                  <List>
                    <List.Item>
                      <strong>Items (variants) processed:</strong> <Badge tone="info">{actionData.feed.itemCount.toString()}</Badge>
                    </List.Item>
                    <List.Item>
                      <strong>Errors:</strong> <Badge tone={actionData.feed.errorCount > 0 ? "critical" : "success"}>{actionData.feed.errorCount.toString()}</Badge>
                    </List.Item>
                    <List.Item>
                      <strong>Warnings:</strong> <Badge tone={actionData.feed.warningCount > 0 ? "warning" : "success"}>{actionData.feed.warningCount.toString()}</Badge>
                    </List.Item>
                    <List.Item>
                      <strong>Health Score:</strong> <Badge tone={actionData.feed.healthScore < 50 ? "critical" : actionData.feed.healthScore < 80 ? "warning" : "success"}>{`${actionData.feed.healthScore}%`}</Badge>
                    </List.Item>
                    <List.Item>
                      <strong>XML Size:</strong> {actionData.feed.sizeKb} KB
                    </List.Item>
                    <List.Item>
                      <strong>Generated At:</strong> {new Date(actionData.feed.lastGeneratedAt!).toLocaleString()}
                    </List.Item>
                  </List>
                </BlockStack>
              </Banner>
            </div>
          )}

          {actionData?.success === false && (
            <div style={{ marginBottom: "16px" }}>
              <Banner title="Generation Failed" tone="critical">
                <p>{actionData.message}</p>
              </Banner>
            </div>
          )}

          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    {`Your ${channel.submitTo} Feed URL`}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {`Copy this link and submit it to ${channel.submitTo}.`}
                  </Text>
                </BlockStack>
                <TextField
                  label="Feed URL"
                  labelHidden
                  value={feedUrl}
                  readOnly
                  autoComplete="off"
                  connectedRight={
                    <Button onClick={handleCopyUrl} variant={isCopied ? "primary" : "secondary"}>
                      {isCopied ? "Copied!" : "Copy URL"}
                    </Button>
                  }
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Force Rebuild Feed
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {`Click the button below to force rebuild your product feed. ${channel.rebuildHint}`}
                  </Text>
                </BlockStack>

                <BlockStack gap="200">
                  <Button
                    variant="primary"
                    size="large"
                    onClick={handleSync}
                    loading={isLoading}
                    disabled={isLoading}
                  >
                    {isLoading ? "Generating XML..." : "Generate feed"}
                  </Button>
                </BlockStack>
              </BlockStack>
            </Card>

            {actionData?.success && actionData.feed?.preview && (
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">XML Preview (First 500 chars):</Text>
                  <pre
                    style={{
                      background: "#f4f6f8",
                      padding: "12px",
                      borderRadius: "4px",
                      overflowX: "auto",
                      fontSize: "12px",
                      fontFamily: "monospace",
                    }}
                  >
                    {actionData.feed.preview}
                  </pre>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>

      <DeleteFeedModal
        feed={showDelete ? { id: feed.id, name: feed.name } : null}
        onClose={() => setShowDelete(false)}
      />
    </Page>
  );
}