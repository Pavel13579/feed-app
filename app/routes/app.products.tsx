import { useEffect } from "react";
import { json} from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, useNavigation, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  List,
  Link,
  InlineStack,
  IndexTable,
  Badge,
  Banner,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "app/db.server";
import { syncAllProducts } from "../models/sync.server";


export const loader = async ({ request }: LoaderFunctionArgs) => {
  const {admin, session} = await authenticate.admin(request);

  const shopData = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    select: { updatedAt: true },
  });

  const defaultProducts = await prisma.product.findMany({ 
    where: {shop: {shopDomain: session.shop}},
    include: { variants: true, images: true } 
  })

  const serializedProducts = defaultProducts.map((product) => ({
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      price: variant.price.toString(),
      compareAtPrice: variant.compareAtPrice?.toString() || null,
    })),
  }));

  return json({serializedProducts,
    lastSync: shopData?.updatedAt || null,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const {admin, session} = await authenticate.admin(request);

  try{
    const cnt = await syncAllProducts(admin, session.shop);
    console.log("Synced");
    return json({ success: true, cnt });
  }catch(error){
    console.log("Sync failed:", error);
    return json({ success: false, cnt: 0, error: "Sync failed" }, { status: 500 });
  }
}



export default function ProductPage() {
  const { serializedProducts, lastSync } = useLoaderData<typeof loader>();

  const actionData = useActionData<typeof action>();

  const navigation = useNavigation();
  const isSyncing = navigation.state === "submitting";

  var formattedDate;
  if(lastSync == null){
    formattedDate = "Never";
  }else{
    formattedDate = new Date(lastSync).toLocaleString();
  }

  return (
    <Page
      title="Product list"
      subtitle={`Last sync: ${formattedDate}`}
      primaryAction = {
        <Form method="post">
          <Button
          submit
          variant="primary"
          loading={isSyncing}
          disabled={isSyncing}
          >
          Sync Now
          </Button>
        </Form>
      }    
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            
            {actionData?.success && !isSyncing && (
              <Banner tone="success" title="Sync Done">
                <p>Synced: <strong>{actionData.cnt}</strong></p>
              </Banner>
            )}

            <Card padding="0">
              <IndexTable
                  resourceName={{ singular: 'Product', plural: 'Products' }}
                  itemCount={serializedProducts.length}
                  headings={[
                      {title: "Title"},
                      {title: "Vendor"},
                      {title: "Variant Number"},
                      {title: "Has Image"}
                  ]}
              >
              {serializedProducts.map((product, index) => {
                  return (
                    <IndexTable.Row id={product.id} key={product.id} position={index}>
                          <IndexTable.Cell>
                              <Text as="span" fontWeight="bold">
                                  {product.title}
                              </Text>
                          </IndexTable.Cell>

                          <IndexTable.Cell>
                              <Text as="span" fontWeight="bold">
                                  {product.vendor || "unknown"}
                              </Text>
                          </IndexTable.Cell>

                          <IndexTable.Cell>
                              <Text as="span" fontWeight="bold">
                                  {product.variants.length} variants
                              </Text>
                          </IndexTable.Cell>

                          <IndexTable.Cell>
                              {product.images && product.images.length > 0 ? (
                                  <Badge tone="success">Yes</Badge>
                              ) : (
                                  <Badge tone="attention">No</Badge>
                              )}
                          </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            </Card>

          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}