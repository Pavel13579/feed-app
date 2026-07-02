import { useEffect } from "react";
import { json} from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
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
  Badge
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "app/db.server";



export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const defaultProducts = await prisma.product.findMany({ include: { variants: true, images: true } })

  const serializedProducts = defaultProducts.map((product) => ({
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      price: variant.price.toString(),
      compareAtPrice: variant.compareAtPrice?.toString() || null,
    })),
  }));

  return json({serializedProducts});
};

export default function DataBasePage() {
  const { serializedProducts } = useLoaderData<typeof loader>();

  return (
    <Page>
      <Card>
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
    </Page>
  );
}