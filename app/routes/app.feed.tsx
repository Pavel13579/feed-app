import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useSubmit, useNavigation, useActionData } from "@remix-run/react";
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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { productsFromShopify } from "app/models/sync.server";
import db from "../db.server";
import { json} from "@remix-run/node";
import { googleAdapter } from "app/services/feeds/adapters/google";
import { Decimal } from "@prisma/client/runtime/library";
import { dbProductToNormalized } from "app/models/normalizer.server";
import { generateFeed } from "app/models/feed.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  return null;
};


export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let shop = await db.shop.findUnique({
    where: { shopDomain: shopDomain },
  });

  if (!shop) {
    shop = await db.shop.create({
      data: { shopDomain: shopDomain },
    });
  }

  let feed = await db.feed.findFirst({
    where: {
      shopId: shop.id,
      channel: "google",
    },
  });

  if (!feed) {
    feed = await db.feed.create({
      data: {
        shopId: shop.id,
        channel: "google",
        name: "Google Shopping Feed",
        token: crypto.randomUUID(),
        content: "",
        itemCount: 0,
      },
    });
  }

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

  const isLoading = navigation.state === "submitting";

  const handleSync = () => {
    submit(null, { method: "POST" });
  };

  return (
    <Page 
      title="Feed Settings"
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
                        <strong>Items skipped:</strong> <Badge tone={actionData.feed.skippedItems > 0 ? "warning" : "success"}>{actionData.feed.skippedItems}</Badge>
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

          <Card>
            <BlockStack gap="400">
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Google Shopping Feed
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
            <div style={{ marginTop: "16px" }}>
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
            </div>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}

