import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Box,
  Text,
  Badge,
  Banner,
  BlockStack,
  InlineStack,
  IndexTable,
  Pagination,
} from "@shopify/polaris";
import { adminProductUrl } from "app/utils/shopifyGid";
import { getIssueProductsPage, ISSUE_PAGE_SIZE } from "app/models/feedIssues.server";
import { authenticateFeedRequest } from "app/models/feedAccess.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, shop, feed, adapter } = await authenticateFeedRequest(request, params.feedId);
  const shopDomain = session.shop;
  const code = (params.code ?? "").toUpperCase();

  if (!adapter.rules.some((rule) => rule.code === code)) {
    throw new Response(`Unknown issue code: ${code}`, { status: 404 });
  }

  const url = new URL(request.url);
  const rawPage = Number(url.searchParams.get("page"));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const { rows, totalProducts, page: safePage, pageCount } =
    await getIssueProductsPage({
      feedId: feed.id,
      shopId: shop.id,
      code,
      page,
      pageSize: ISSUE_PAGE_SIZE,
    });

  return json({
    feedId: feed.id,
    feedName: feed.name,
    code,
    meta: adapter.ruleMeta[code] ?? { title: code, hint: "Review product attributes." },
    severity: adapter.rules.find((rule) => rule.code === code)?.severity ?? "warning",
    lastGeneratedAt: feed.lastGeneratedAt,
    products: rows.map((row) => ({
      ...row,
      adminUrl: adminProductUrl(shopDomain, row.shopifyId),
    })),
    totalProducts,
    page: safePage,
    pageCount,
  });
};

export default function FeedHealthIssuePage() {
  const { feedId, feedName, code, meta, severity, products, totalProducts, page, pageCount, lastGeneratedAt } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const goToPage = (next: number) => {
    navigate(
      next <= 1
        ? `/app/feeds/${feedId}/health/${code}`
        : `/app/feeds/${feedId}/health/${code}?page=${next}`,
    );
  };

  return (
    <Page
      title={meta.title}
      subtitle={code}
      backAction={{ content: `${feedName} — Health`, url: `/app/feeds/${feedId}/health` }}
      titleMetadata={
        <Badge tone={severity === "error" ? "critical" : "warning"}>{severity}</Badge>
      }
    >
      <Layout>
        <Layout.Section>
          <Banner tone={severity === "error" ? "critical" : "warning"} title="How to fix">
            <p>{meta.hint}</p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <Box padding="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  {totalProducts} affected {totalProducts === 1 ? "product" : "products"}
                </Text>
                {lastGeneratedAt ? (
                  <Text as="span" variant="bodySm" tone="subdued">
                    Snapshot from {new Date(lastGeneratedAt).toLocaleString()}
                  </Text>
                ) : null}
              </InlineStack>
            </Box>

            {products.length === 0 ? (
              <Box padding="400">
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    No products are currently affected by this issue.
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    The catalog may have changed since the last feed generation. Regenerate the
                    feed to refresh this report.
                  </Text>
                </BlockStack>
              </Box>
            ) : (
              <IndexTable
                resourceName={{ singular: "product", plural: "products" }}
                itemCount={products.length}
                headings={[
                  { title: "Product" },
                  { title: "Affected variants" },
                  { title: "Details" },
                  { title: "" },
                ]}
                selectable={false}
              >
                {products.map((product, index) => (
                  <IndexTable.Row
                    id={product.productId}
                    key={product.productId}
                    position={index}
                  >
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {product.title}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone="info">{product.affectedVariants.toString()}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {product.message ?? "—"}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {product.adminUrl ? (
                        <a href={product.adminUrl} target="_top">
                          Open in Shopify
                        </a>
                      ) : (
                        <Text as="span" variant="bodySm" tone="subdued">
                          No admin link
                        </Text>
                      )}
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}

            {pageCount > 1 ? (
              <Box padding="400" borderBlockStartWidth="025" borderColor="border">
                <InlineStack align="center">
                  <Pagination
                    hasPrevious={page > 1}
                    onPrevious={() => goToPage(page - 1)}
                    hasNext={page < pageCount}
                    onNext={() => goToPage(page + 1)}
                    label={`Page ${page} of ${pageCount}`}
                  />
                </InlineStack>
              </Box>
            ) : null}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}