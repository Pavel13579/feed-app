import { useFetcher } from "@remix-run/react";
import { Modal, Text } from "@shopify/polaris";

interface DeleteFeedModalProps {
  feed: { id: string; name: string } | null;
  onClose: () => void;
}

export function DeleteFeedModal({ feed, onClose }: DeleteFeedModalProps) {
  const fetcher = useFetcher();
  const isDeleting = fetcher.state !== "idle";

  const handleDelete = () => {
    if (!feed) return;
    fetcher.submit(null, { method: "post", action: `/app/feeds/${feed.id}/delete` });
  };

  return (
    <Modal
      open={feed !== null}
      onClose={isDeleting ? () => {} : onClose}
      title="Delete feed?"
      primaryAction={{
        content: "Delete feed",
        destructive: true,
        onAction: handleDelete,
        loading: isDeleting,
        disabled: isDeleting,
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose, disabled: isDeleting }]}
    >
      <Modal.Section>
        <Text as="p" variant="bodyMd">
          {`"${feed?.name ?? ""}" and its detected issues will be deleted permanently. The public feed URL will stop working (404) — remove it from the channel too, otherwise the channel will keep failing to fetch it.`}
        </Text>
      </Modal.Section>
    </Modal>
  );
}