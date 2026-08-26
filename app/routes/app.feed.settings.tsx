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
  RadioButton,
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
import {
  getFeedSettings,
  isValidPriceSettings,
  type CategoryMappingRow,
  type FeedSettings,
  type PriceSettings,
  type PriceMode,
  type PriceAdjustmentType,
} from "app/services/feeds/settings";

const CHANNEL = googleAdapter.channel;

interface CategoryRow extends CategoryMappingRow {
  productCount: number;
}

interface PriceFormState {
  mode: PriceMode;
  adjustmentType: PriceAdjustmentType;
  adjustmentValueRaw: string;
  taxPercentRaw: string;
}

function priceSettingsToFormState(price: PriceSettings): PriceFormState {
  return {
    mode: price.mode,
    adjustmentType: price.adjustmentType,
    adjustmentValueRaw: String(price.adjustmentValue),
    taxPercentRaw: price.taxPercent !== null ? String(price.taxPercent) : "",
  };
}

interface PriceFormErrors {
  adjustmentValueError?: string;
  taxPercentError?: string;
}

function validatePriceForm(form: PriceFormState): PriceFormErrors & { valid: boolean } {
  const errors: PriceFormErrors = {};

  if (form.mode === "web_plus" || form.mode === "web_minus") {
    const trimmed = form.adjustmentValueRaw.trim();
    const value = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(value) || value < 0) {
      errors.adjustmentValueError = "Enter a number ≥ 0";
    }
  }

  const taxTrimmed = form.taxPercentRaw.trim();
  if (taxTrimmed !== "") {
    const value = Number(taxTrimmed);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      errors.taxPercentError = "Enter a number between 0 and 100";
    }
  }

  return { ...errors, valid: !errors.adjustmentValueError && !errors.taxPercentError };
}

function priceFormStateToSettings(form: PriceFormState): PriceSettings {
  const adjustmentValue =
    form.mode === "web_plus" || form.mode === "web_minus" ? Number(form.adjustmentValueRaw.trim()) : 0;
  const taxPercent = form.taxPercentRaw.trim() === "" ? null : Number(form.taxPercentRaw.trim());

  return {
    mode: form.mode,
    adjustmentType: form.adjustmentType,
    adjustmentValue,
    taxPercent,
  };
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

  return json({
    rows,
    channelCategories,
    totalProductCount,
    productsWithoutType,
    price: feedSettings.price,
  });
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

  const rawCategoryMapping = formData.get("categoryMapping");

  let parsedCategoryMapping: unknown;
  try {
    parsedCategoryMapping = JSON.parse(typeof rawCategoryMapping === "string" ? rawCategoryMapping : "[]");
  } catch {
    return json({ success: false as const, error: "Malformed form submission" }, { status: 400 });
  }

  if (!Array.isArray(parsedCategoryMapping)) {
    return json({ success: false as const, error: "Malformed form submission" }, { status: 400 });
  }

  const categoryMapping: CategoryMappingRow[] = parsedCategoryMapping
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


  const rawPrice = formData.get("price");

  let parsedPrice: unknown;
  try {
    parsedPrice = JSON.parse(typeof rawPrice === "string" ? rawPrice : "null");
  } catch {
    return json({ success: false as const, error: "Malformed form submission" }, { status: 400 });
  }

  if (!isValidPriceSettings(parsedPrice)) {
    return json(
      { success: false as const, error: "Invalid price settings — check the values in the Price card." },
      { status: 400 },
    );
  }

  const settings: FeedSettings = { categoryMapping, price: parsedPrice };

  await db.feed.update({
    where: { id: feed.id },
    data: { settings: settings as unknown as Prisma.InputJsonValue },
  });

  return json({ success: true as const });
};

export default function FeedSettingsPage() {
  const {
    rows: initialRows,
    channelCategories,
    totalProductCount,
    productsWithoutType,
    price: initialPrice,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [rows, setRows] = useState<CategoryRow[]>(initialRows);
  const [priceForm, setPriceForm] = useState<PriceFormState>(() => priceSettingsToFormState(initialPrice));
  const isSaving = navigation.state === "submitting";

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    setPriceForm(priceSettingsToFormState(initialPrice));
  }, [initialPrice]);

  const categoryOptions = [
    { label: "Not selected", value: "" },
    ...channelCategories.map((cat) => ({ label: cat.path, value: String(cat.id) })),
  ];

  const updateRow = (index: number, patch: Partial<CategoryRow>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const priceErrors = validatePriceForm(priceForm);

  const handleSave = () => {
    if (!priceErrors.valid) return;

    const formData = new FormData();
    formData.set("categoryMapping", JSON.stringify(rows));
    formData.set("price", JSON.stringify(priceFormStateToSettings(priceForm)));
    submit(formData, { method: "POST" });
  };

  const isRowMapped = (row: CategoryRow) => (row.custom ? !!row.customValue : !!row.category);

  const unmappedTypedProductCount = rows
    .filter((row) => !isRowMapped(row))
    .reduce((sum, row) => sum + row.productCount, 0);

  const totalUnmappedProducts = unmappedTypedProductCount + productsWithoutType;

  const showAdjustmentFields = priceForm.mode === "web_plus" || priceForm.mode === "web_minus";

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
              <Banner tone="success" title="Settings saved" />
            )}

            {actionData?.success === false && (
              <Banner tone="critical" title="Could not save settings">
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
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Price
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Control what price is sent to the feed — as-is from Shopify, or adjusted.
                  </Text>
                </BlockStack>

                <Select
                  label="Price mode"
                  options={[
                    { label: "As is (Shopify price)", value: "as_is" },
                    { label: "Undiscounted price (ignore compare-at)", value: "undiscounted" },
                    { label: "Store price + adjustment", value: "web_plus" },
                    { label: "Store price − adjustment", value: "web_minus" },
                  ]}
                  value={priceForm.mode}
                  onChange={(value) => setPriceForm((p) => ({ ...p, mode: value as PriceMode }))}
                />

                {showAdjustmentFields && (
                  <BlockStack gap="200">
                    <TextField
                      label="Adjustment value"
                      type="number"
                      min={0}
                      value={priceForm.adjustmentValueRaw}
                      onChange={(value) => setPriceForm((p) => ({ ...p, adjustmentValueRaw: value }))}
                      error={priceErrors.adjustmentValueError}
                      autoComplete="off"
                      helpText={
                        priceForm.adjustmentType === "fixed"
                          ? "In your store's currency, major units (e.g. 500, not 50000)"
                          : undefined
                      }
                    />
                    <InlineStack gap="400">
                      <RadioButton
                        label="%"
                        checked={priceForm.adjustmentType === "percent"}
                        onChange={() => setPriceForm((p) => ({ ...p, adjustmentType: "percent" }))}
                      />
                      <RadioButton
                        label="Fixed amount"
                        checked={priceForm.adjustmentType === "fixed"}
                        onChange={() => setPriceForm((p) => ({ ...p, adjustmentType: "fixed" }))}
                      />
                    </InlineStack>
                  </BlockStack>
                )}

                <TextField
                  label="Tax %"
                  type="number"
                  min={0}
                  max={100}
                  value={priceForm.taxPercentRaw}
                  onChange={(value) => setPriceForm((p) => ({ ...p, taxPercentRaw: value }))}
                  error={priceErrors.taxPercentError}
                  placeholder="Leave empty to not apply tax"
                  autoComplete="off"
                />
              </BlockStack>
            </Card>

            <InlineStack align="end">
              <Button
                variant="primary"
                onClick={handleSave}
                loading={isSaving}
                disabled={isSaving || !priceErrors.valid}
              >
                Save
              </Button>
            </InlineStack>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}