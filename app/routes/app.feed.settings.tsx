import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation, useSubmit } from "@remix-run/react";
import { useEffect, useState } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Select,
  Checkbox,
  TextField,
  Button,
  Banner,
  Badge,
  Divider,
} from "@shopify/polaris";
import { Prisma } from "@prisma/client";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { googleAdapter } from "app/services/feeds/adapters/google";
import { getChannelCategories } from "app/services/feeds/registry";
import { getFeedSettings, type CategoryMappingRow, type FeedSettings } from "app/services/feeds/settings";

const CHANNEL = googleAdapter.channel;

interface CategoryRow extends CategoryMappingRow {
  productCount: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await db.shop.findUnique({ where: { shopDomain } });

  const feed = shop
    ? await db.feed.findFirst({ where: { shopId: shop.id, channel: CHANNEL } })
    : null;

  const feedSettings = getFeedSettings(feed?.settings ?? null);
  const channelCategories = getChannelCategories(CHANNEL);

  const totalProductCount = shop ? await db.product.count({ where: { shopId: shop.id } }) : 0;

  const productTypeCounts = shop
    ? await db.product.groupBy({
        by: ["productType"],
        where: { shopId: shop.id },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      })
    : [];

  const savedByType = new Map(feedSettings.categoryMapping.map((row) => [row.productType, row]));
  const dbTypes = new Set<string>();

  const rows: CategoryRow[] = [];
  let typedProductCount = 0;

  for (const entry of productTypeCounts) {
    if (!entry.productType) continue;

    dbTypes.add(entry.productType);
    typedProductCount += entry._count.id;
    const saved = savedByType.get(entry.productType);

    rows.push({
      productType: entry.productType,
      category: saved?.category ?? null,
      custom: saved?.custom ?? false,
      customValue: saved?.customValue ?? null,
      productCount: entry._count.id,
    });
  }

  for (const saved of feedSettings.categoryMapping) {
    if (!dbTypes.has(saved.productType)) {
      rows.push({ ...saved, productCount: 0 });
    }
  }

  const productsWithoutType = totalProductCount - typedProductCount;

  return json({ rows, channelCategories, totalProductCount, productsWithoutType });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) {
    shop = await db.shop.create({ data: { shopDomain } });
  }

  let feed = await db.feed.findFirst({ where: { shopId: shop.id, channel: CHANNEL } });
  if (!feed) {
    feed = await db.feed.create({
      data: {
        shopId: shop.id,
        channel: CHANNEL,
        name: "Google Shopping Feed",
        token: crypto.randomUUID(),
        content: "",
        itemCount: 0,
      },
    });
  }

  const formData = await request.formData();
  const raw = formData.get("categoryMapping");

  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === "string" ? raw : "[]");
  } catch {
    return json({ success: false as const, error: "Malformed form submission" }, { status: 400 });
  }

  if (!Array.isArray(parsed)) {
    return json({ success: false as const, error: "Malformed form submission" }, { status: 400 });
  }

  const categoryMapping: CategoryMappingRow[] = parsed
    .filter(
      (row): row is Record<string, unknown> =>
        !!row && typeof row === "object" && typeof (row as Record<string, unknown>).productType === "string",
    )
    .map((row) => {
      const custom = row.custom === true;
      const customValueRaw = typeof row.customValue === "string" ? row.customValue.trim() : "";
      const categoryRaw = row.category != null ? String(row.category).trim() : "";

      return {
        productType: row.productType as string,
        category: custom ? null : (categoryRaw.length > 0 ? categoryRaw : null),
        custom,
        customValue: custom && customValueRaw ? customValueRaw : null,
      };
    });

  const settings: FeedSettings = { categoryMapping };

  await db.feed.update({
    where: { id: feed.id },
    data: { settings: settings as unknown as Prisma.InputJsonValue },
  });

  return json({ success: true as const });
};

export default function FeedSettingsPage() {
  const { rows: initialRows, channelCategories, totalProductCount, productsWithoutType } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [rows, setRows] = useState<CategoryRow[]>(initialRows);
  const isSaving = navigation.state === "submitting";

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const categoryOptions = [
    { label: "Not selected", value: "" },
    ...channelCategories.map((cat) => ({ label: cat.path, value: String(cat.id) })),
  ];

  const updateRow = (index: number, patch: Partial<CategoryRow>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const handleSave = () => {
    const formData = new FormData();
    formData.set("categoryMapping", JSON.stringify(rows));
    submit(formData, { method: "POST" });
  };

  const isRowMapped = (row: CategoryRow) => (row.custom ? !!row.customValue : !!row.category);
  
  const unmappedTypedProductCount = rows
    .filter((row) => !isRowMapped(row))
    .reduce((sum, row) => sum + row.productCount, 0);

  const totalUnmappedProducts = unmappedTypedProductCount + productsWithoutType;

  return (
    <Page title="Feed Settings — Categories" backAction={{ content: "Back", url: "/app/feed" }}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {totalUnmappedProducts > 0 && (
              <Banner tone="warning" title="Some products won't have a category in the feed">
                <BlockStack gap="100">
                  {unmappedTypedProductCount > 0 && (
                    <Text as="p">
                      {`${unmappedTypedProductCount} ${unmappedTypedProductCount === 1 ? "product has" : "products have"} unmapped product types — pick a category below.`}
                    </Text>
                  )}
                  {productsWithoutType > 0 && (
                    <Text as="p">
                      {`${productsWithoutType} ${productsWithoutType === 1 ? "product has" : "products have"} no Product type set in Shopify — set it on the product page (Organization → Type), then sync again.`}
                    </Text>
                  )}
                </BlockStack>
              </Banner>
            )}

            {actionData?.success === true && (
              <Banner tone="success" title="Category mapping saved" />
            )}

            {actionData?.success === false && (
              <Banner tone="critical" title="Could not save mapping">
                <p>{actionData.error}</p>
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">
                      Categories
                    </Text>
                    {totalUnmappedProducts > 0 ? (
                      <Badge tone="warning">
                        {`${totalUnmappedProducts} ${totalUnmappedProducts === 1 ? "product" : "products"} without channel category`}
                      </Badge>
                    ) : (
                      <Badge tone="success">All products mapped</Badge>
                    )}
                  </InlineStack>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Map each of your product types to a Google product category. Unmapped
                    product types are sent without g:google_product_category.
                  </Text>
                </BlockStack>

                {rows.length === 0 && totalProductCount === 0 && (
                  <Text as="p" tone="subdued">
                    No products synced yet — sync your products first.
                  </Text>
                )}

                {rows.length === 0 && totalProductCount > 0 && (
                  <Text as="p" tone="subdued">
                    {`You have ${totalProductCount} ${totalProductCount === 1 ? "product" : "products"} synced, but none have a Product type set in Shopify. Set Product type on your products (Shopify Admin → Products → Organization), sync again, and they'll appear here.`}
                  </Text>
                )}

                {rows.map((row, index) => (
                  <BlockStack gap="200" key={row.productType}>
                    {index > 0 && <Divider />}
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="span" fontWeight="bold">
                        {row.productType}
                      </Text>
                      <Badge tone={row.productCount > 0 ? undefined : "attention"}>
                        {`${row.productCount} ${row.productCount === 1 ? "product" : "products"}`}
                      </Badge>
                    </InlineStack>

                    {!row.custom && (
                      <Select
                        label="Google category"
                        labelHidden
                        options={categoryOptions}
                        value={row.category ?? ""}
                        onChange={(value) => updateRow(index, { category: value || null })}
                      />
                    )}

                    <Checkbox
                      label="Custom"
                      checked={row.custom}
                      onChange={(checked) => updateRow(index, { custom: checked })}
                    />

                    {row.custom && (
                      <TextField
                        label="Custom category"
                        labelHidden
                        placeholder="Apparel & Accessories > Clothing > Shirts & Tops"
                        value={row.customValue ?? ""}
                        onChange={(value) => updateRow(index, { customValue: value })}
                        autoComplete="off"
                      />
                    )}
                  </BlockStack>
                ))}

                {rows.length > 0 && (
                  <InlineStack align="end">
                    <Button variant="primary" onClick={handleSave} loading={isSaving} disabled={isSaving}>
                      Save
                    </Button>
                  </InlineStack>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}