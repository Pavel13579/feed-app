import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { useState } from "react";
import { Banner, BlockStack, Button, Card, InlineStack, Layout, Page, Select, Text, TextField } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { createFeed } from "app/models/feed.server";
import { FEED_NAME_MAX_LENGTH } from "app/services/feeds/constants";
import { findAdapter, listAdapters } from "app/services/feeds/registry";

function channelOptions() {
  return listAdapters().map((adapter) => ({
    channel: adapter.channel,
    label: adapter.descriptor.label,
    defaultFeedName: adapter.descriptor.defaultFeedName,
    submitTo: adapter.descriptor.submitTo,
  }));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({ channels: channelOptions() });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);
  const formData = await request.formData();

  const channel = formData.get("channel");
  const rawName = formData.get("name");

  if (typeof channel !== "string" || !findAdapter(channel)) {
    return json({ success: false as const, error: "Choose a channel from the list." }, { status: 400 });
  }

  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (name.length > FEED_NAME_MAX_LENGTH) {
    return json(
      { success: false as const, error: `Name is too long (max ${FEED_NAME_MAX_LENGTH} characters).` },
      { status: 400 },
    );
  }

  const feed = await createFeed({ shopDomain: session.shop, channel, name });
  return redirect(`/app/feeds/${feed.id}`);
};

export default function NewFeedPage() {
  const { channels } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [channel, setChannel] = useState(channels[0]?.channel ?? "");
  const [name, setName] = useState(channels[0]?.defaultFeedName ?? "");
  const [nameTouched, setNameTouched] = useState(false);

  const isSubmitting = navigation.state === "submitting";
  const selected = channels.find((c) => c.channel === channel);

  const handleChannelChange = (value: string) => {
    setChannel(value);

    if (!nameTouched) {
      setName(channels.find((c) => c.channel === value)?.defaultFeedName ?? "");
    }
  };

  const handleCreate = () => {
    const formData = new FormData();
    formData.set("channel", channel);
    formData.set("name", name);
    submit(formData, { method: "post" });
  };

  return (
    <Page title="Create feed" backAction={{ content: "Feeds", url: "/app/feeds" }}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionData?.success === false && (
              <Banner tone="critical" title="Could not create feed">
                <p>{actionData.error}</p>
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <Select
                  label="Channel"
                  options={channels.map((c) => ({ label: c.label, value: c.channel }))}
                  value={channel}
                  onChange={handleChannelChange}
                  helpText={selected ? `You will submit the feed URL to ${selected.submitTo}.` : undefined}
                />
                <TextField
                  label="Feed name"
                  value={name}
                  onChange={(value) => {
                    setNameTouched(true);
                    setName(value);
                  }}
                  maxLength={FEED_NAME_MAX_LENGTH}
                  autoComplete="off"
                  helpText="Only you see this name. Leave empty to use the default."
                />
                {channels.length === 0 && (
                  <Text as="p" tone="critical">
                    No channels are available.
                  </Text>
                )}
                <InlineStack align="end" gap="200">
                  <Button url="/app/feeds">Cancel</Button>
                  <Button
                    variant="primary"
                    onClick={handleCreate}
                    loading={isSubmitting}
                    disabled={isSubmitting || !channel}
                  >
                    Create feed
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}