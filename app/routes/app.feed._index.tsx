import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
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
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { json } from "@remix-run/node";
import { googleAdapter } from "app/services/feeds/adapters/google";
import { ensureShopAndFeed, generateFeed } from "app/models/feed.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await db.shop.findUnique({
    where: { shopDomain: shopDomain },
  });

  let feedToken = null;
  if (shop) {
    const feed = await db.feed.findFirst({
      where: {
        shopId: shop.id,
        channel: googleAdapter.channel,
      },
    });
    if (feed) {
      feedToken = feed.token;
    }
  }

  const appUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;

  return json({ appUrl, feedToken });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const { feed } = await ensureShopAndFeed(
    shopDomain, 
    googleAdapter.channel, 
    "Google Shopping Feed"
  );

  try {
    const updatedFeed = await generateFeed(feed.id);
    const xmlSizeBytes = Buffer.byteLength(updatedFeed.content || "", "utf8");
    const xmlSizeKb = (xmlSizeBytes / 1024).toFixed(2);

    return json({ 
      success: true, 
      message: "Feed successfully updated", 
      feed: {
        itemCount: updatedFeed.itemCount,
        skippedItems: updatedFeed.skippedItems,
        lastGeneratedAt: updatedFeed.lastGeneratedAt,
        sizeKb: xmlSizeKb,
        preview: updatedFeed.content ? updatedFeed.content.substring(0, 500) + "..." : ""
      }
    });
  } catch (error: any) {
    return json({ 
      success: false, 
      message: `Generation failed: ${error.message}`,
      feed: null 
    }, { status: 500 });
  }
};

export default function FeedPage() {
  const submit = useSubmit();
  const navigation = useNavigation();
  const actionData = useActionData<typeof action>();
  const { appUrl, feedToken } = useLoaderData<typeof loader>();

  const [isCopied, setIsCopied] = useState(false);
  const isLoading = navigation.state === "submitting";

  const feedUrl = feedToken ? `${appUrl}/feed/${feedToken}/${googleAdapter.filename}` : "";

  const handleSync = () => {
    submit(null, { method: "POST" });
  };

  const handleCopyUrl = useCallback(async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setIsCopied(true);

      if (typeof shopify !== 'undefined' && shopify.toast) {
        shopify.toast.show('Link copied');
      }

      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy feed URL:', error);

      if (typeof shopify !== 'undefined' && shopify.toast) {
        shopify.toast.show('Could not copy link — please copy it manually', { isError: true });
      }
    }
  }, [feedUrl]);

  return (
    <Page 
      title="Feed Generation"
      backAction={{ content: "Back", url: "/app" }} 
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
                      <strong>Items skipped:</strong> <Badge tone={actionData.feed.skippedItems > 0 ? "warning" : "success"}>{actionData.feed.skippedItems.toString()}</Badge>
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
            {feedUrl && (
              <Card>
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Your Google Merchant Feed URL
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Copy this link and submit it to Google Merchant Center.
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
            )}

            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Force Rebuild Feed
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Click the button below to force rebuild your product feed. This will compile all active variants and map them into standard Google Merchant Center format.
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
                  <pre style={{ 
                    background: "#f4f6f8", 
                    padding: "12px", 
                    borderRadius: "4px", 
                    overflowX: "auto",
                    fontSize: "12px",
                    fontFamily: "monospace"
                  }}>
                    {actionData.feed.preview}
                  </pre>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}