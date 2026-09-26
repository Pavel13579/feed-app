import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useState } from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { findAdapter } from "app/services/feeds/registry";
import { DeleteFeedModal } from "app/components/DeleteFeedModal";

const HEALTH_THRESHOLD_SUCCESS = 90;
const HEALTH_THRESHOLD_WARNING = 70;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });

  const feeds = shop
    ? await db.feed.findMany({
        where: { shopId: shop.id },
        select: {
          id: true,
          name: true,
          channel: true,
          healthScore: true,
          errorCount: true,
          warningCount: true,
          itemCount: true,
          lastGeneratedAt: true,
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  return json({
    feeds: feeds.map((feed) => ({
      ...feed,
      channelLabel: findAdapter(feed.channel)?.descriptor.label ?? feed.channel,
    })),
  });
};

function healthTone(score: number) {
  if (score >= HEALTH_THRESHOLD_SUCCESS) return "success";
  if (score >= HEALTH_THRESHOLD_WARNING) return "warning";
  return "critical";
}

export default function FeedsListPage() {
  const { feeds } = useLoaderData<typeof loader>();
  const generateFetcher = useFetcher<{ success: boolean; message: string }>();
  const [feedToDelete, setFeedToDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (feedToDelete && !feeds.some((feed) => feed.id === feedToDelete.id)) {
      setFeedToDelete(null);
    }
  }, [feeds, feedToDelete]);

  const generatingFeedId =
    generateFetcher.state !== "idle" && generateFetcher.formAction
      ? generateFetcher.formAction.split("/").filter(Boolean).pop()
      : null;

  const handleGenerate = (feedId: string) => {
    generateFetcher.submit(null, { method: "post", action: `/app/feeds/${feedId}` });
  };

  return (
    <Page
      title="Feeds"
      primaryAction={{ content: "Create feed", url: "/app/feeds/new" }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {generateFetcher.data?.success === false && (
              <Banner tone="critical" title="Generation failed">
                <p>{generateFetcher.data.message}</p>
              </Banner>
            )}

            {feeds.length === 0 ? (
              <Card>
                <EmptyState
                  heading="Create your first feed"
                  action={{ content: "Create feed", url: "/app/feeds/new" }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>A feed is a link to your product catalog in the format of a specific sales channel.</p>
                </EmptyState>
              </Card>
            ) : (
              <Card padding="0">
                <IndexTable
                  resourceName={{ singular: "feed", plural: "feeds" }}
                  itemCount={feeds.length}
                  selectable={false}
                  headings={[
                    { title: "Name" },
                    { title: "Channel" },
                    { title: "Health" },
                    { title: "Last generated" },
                    { title: "Actions" },
                  ]}
                >
                  {feeds.map((feed, index) => (
                    <IndexTable.Row id={feed.id} key={feed.id} position={index}>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd" fontWeight="bold">
                          {feed.name}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{feed.channelLabel}</IndexTable.Cell>
                      <IndexTable.Cell>
                        {feed.lastGeneratedAt && feed.healthScore !== null ? (
                          <InlineStack gap="200" blockAlign="center">
                            <Badge tone={healthTone(feed.healthScore)}>{`${feed.healthScore}%`}</Badge>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {`${feed.errorCount} errors · ${feed.warningCount} warnings`}
                            </Text>
                          </InlineStack>
                        ) : (
                          <Badge>Not generated</Badge>
                        )}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {feed.lastGeneratedAt ? new Date(feed.lastGeneratedAt).toLocaleString() : "—"}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="200" wrap={false}>
                          <Button
                            size="slim"
                            onClick={() => handleGenerate(feed.id)}
                            loading={generatingFeedId === feed.id}
                            disabled={generatingFeedId !== null}
                          >
                            Generate
                          </Button>
                          <Button size="slim" url={`/app/feeds/${feed.id}/settings`}>
                            Settings
                          </Button>
                          <Button size="slim" url={`/app/feeds/${feed.id}/health`}>
                            Health
                          </Button>
                          <Button
                            size="slim"
                            tone="critical"
                            onClick={() => setFeedToDelete({ id: feed.id, name: feed.name })}
                          >
                            Delete
                          </Button>
                        </InlineStack>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>

      <DeleteFeedModal feed={feedToDelete} onClose={() => setFeedToDelete(null)} />
    </Page>
  );
}