import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  ProgressBar,
  Badge,
  Banner,
  IndexTable,
  Button,
  Box,
  InlineStack,
  Link,
} from "@shopify/polaris";
import db from "../db.server";
import { authenticateFeedRequest } from "app/models/feedAccess.server";

const HEALTH_THRESHOLD_SUCCESS = 90;
const HEALTH_THRESHOLD_WARNING = 70;

type RawIssueGroup = {
  code: string;
  severity: string;
  issue_count: bigint;
  product_count: bigint;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { shop, feed, adapter } = await authenticateFeedRequest(request, params.feedId);

  const productCount = await db.product.count({
    where: { shopId: shop.id, status: "ACTIVE" },
  });

  const rawIssues = await db.$queryRaw<RawIssueGroup[]>`
    SELECT "code", "severity",
           COUNT(*) AS issue_count,
           COUNT(DISTINCT "productId") AS product_count
    FROM "FeedIssue"
    WHERE "feedId" = ${feed.id}
    GROUP BY "code", "severity"
  `;

  const issues = rawIssues
    .map((item) => ({
      code: item.code,
      severity: item.severity,
      count: Number(item.issue_count),
      productCount: Number(item.product_count),
    }))
    .sort((a, b) => {
      if (a.severity === "error" && b.severity !== "error") return -1;
      if (a.severity !== "error" && b.severity === "error") return 1;
      return b.productCount - a.productCount;
    });

  return json({
    feed: {
      id: feed.id,
      name: feed.name,
      healthScore: feed.healthScore,
      errorCount: feed.errorCount,
      warningCount: feed.warningCount,
      itemCount: feed.itemCount,
      lastGeneratedAt: feed.lastGeneratedAt,
    },
    channel: adapter.descriptor,
    ruleMeta: adapter.ruleMeta,
    issues,
    productCount,
  });
};

export default function FeedHealthPage() {
  const { feed, channel, ruleMeta, issues, productCount } = useLoaderData<typeof loader>();

  const getHealthBadgeTone = (score: number) => {
    if (score >= HEALTH_THRESHOLD_SUCCESS) return "success";
    if (score >= HEALTH_THRESHOLD_WARNING) return "warning";
    return "critical";
  };

  if (!feed.lastGeneratedAt) {
    return (
      <Page title="Feed Health" backAction={{ content: feed.name, url: `/app/feeds/${feed.id}` }}>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400" align="center">
                <Banner tone="info" title="Feed not generated yet">
                  <p>Generate your product feed first to see health metrics and detected issues.</p>
                </Banner>
                <Box paddingBlockStart="200">
                  <Button variant="primary" url={`/app/feeds/${feed.id}`}>
                    Go to Feed Generation
                  </Button>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  if (productCount === 0) {
    return (
      <Page title="Feed Health" backAction={{ content: feed.name, url: `/app/feeds/${feed.id}` }}>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Banner tone="warning" title="No active products found">
                  <p>Your catalog has no active products. Run a product sync to import items before checking feed health.</p>
                </Banner>
                <Button variant="primary" url="/app/products">
                  Go to Products
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const healthScore = feed.healthScore ?? 100;

  return (
    <Page
      title="Feed Health"
      subtitle={`${feed.name} · ${channel.healthSubtitle}`}
      backAction={{ content: feed.name, url: `/app/feeds/${feed.id}` }}
      secondaryActions={[
        { content: "Generate Feed", url: `/app/feeds/${feed.id}` },
      ]}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Overall Health Score
                </Text>
                <Badge tone={getHealthBadgeTone(healthScore)}>
                  {`${healthScore}%`}
                </Badge>
              </InlineStack>

              <ProgressBar
                progress={healthScore}
                tone={
                  healthScore >= HEALTH_THRESHOLD_SUCCESS
                    ? "primary"
                    : healthScore >= HEALTH_THRESHOLD_WARNING
                    ? "highlight"
                    : "critical"
                }
              />

              <InlineStack gap="600">
                <Text as="p" variant="bodyMd">
                  <strong>Errors:</strong> <span style={{ color: "red" }}>{feed.errorCount}</span>
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Warnings:</strong> <span style={{ color: "orange" }}>{feed.warningCount}</span>
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Processed Items: {feed.itemCount}
                </Text>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {issues.length === 0 ? (
          <Layout.Section>
            <Card>
              <BlockStack gap="400" align="center">
                <Banner tone="success" title="Everything is clean!">
                  <p>{channel.healthyMessage}</p>
                </Banner>
              </BlockStack>
            </Card>
          </Layout.Section>
        ) : (
          <Layout.Section>
            <Card padding="0">
              <Box padding="400">
                <Text as="h3" variant="headingMd">
                  Detected Issue Groups
                </Text>
              </Box>
              <IndexTable
                resourceName={{ singular: "issue group", plural: "issue groups" }}
                itemCount={issues.length}
                headings={[
                  { title: "Code" },
                  { title: "Title & Description" },
                  { title: "Severity" },
                  { title: "Affected Products" },
                  { title: "How to fix" },
                ]}
                selectable={false}
              >
                {issues.map((issue, index) => {
                  const meta = ruleMeta[issue.code] || {
                    title: issue.code,
                    hint: "Review product attributes.",
                  };

                  return (
                    <IndexTable.Row id={issue.code} key={issue.code} position={index}>
                      <IndexTable.Cell>
                        <Link url={`/app/feeds/${feed.id}/health/${issue.code}`} removeUnderline>
                          <Text as="span" variant="bodyMd" fontWeight="bold">
                            {issue.code}
                          </Text>
                        </Link>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd">
                          {meta.title}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={issue.severity === "error" ? "critical" : "warning"}>
                          {issue.severity}
                        </Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="150" blockAlign="center">
                          <Badge tone="info">{issue.productCount.toString()}</Badge>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {`${issue.count} variant ${issue.count === 1 ? "row" : "rows"}`}
                          </Text>
                        </InlineStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {meta.hint}
                        </Text>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}