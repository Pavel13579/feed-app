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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { productsFromShopify } from "app/models/sync.server";
import db from "../db.server";
import { json} from "@remix-run/node";

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


  const existingFeed = await db.feed.findFirst({
    where: {
      shopId: shop.id,
      channel: "google",
    },
  });

  if (existingFeed) {
    return json({ 
      success: true, 
      message: "Google feed exists", 
      feed: existingFeed 
    });
  }

 
  const token = crypto.randomUUID(); 

  const newFeed = await db.feed.create({
    data: {
      shopId: shop.id,
      channel: "google",
      name: "Google Shopping Feed",
      token: token,
      content: null, 
      itemCount: 0,
    },
  });

  return json({ 
    success: true, 
    message: "Success", 
    feed: newFeed 
  });
};

export default function SyncPage() {
  const submit = useSubmit();
  const navigation = useNavigation();
  const actionData = useActionData<typeof action>();

  const isLoading = navigation.state === "submitting";

  const handleSync = () => {
    submit(null, { method: "POST" });
  };

  return (
    <Page 
      title="Feed"
      backAction={{ content: "Back", url: "/app" }} 
    >
      <Layout>
        <Layout.Section>
          {actionData?.success && (
            <div style={{ marginBottom: "16px" }}>
              <Banner title="Success" tone="success">
                <p>{actionData.message}</p>
              </Banner>
            </div>
          )}

          <Card>
            <BlockStack gap="400">
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Generate feed to db
                </Text>
                <Text as="p" variant="bodyMd">
                  Press button
                </Text>
              </BlockStack>

              <BlockStack gap="200">
                <Button 
                  variant="primary" 
                  size="large" 
                  onClick={handleSync}
                  loading={isLoading}
                >
                  {isLoading ? "Generation" : "Generate feed"}
                </Button>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}