import type {
  AppServerClientNotificationOf,
  Turn
} from "../../src/index.js";

export type StreamingFixtureNotification =
  | AppServerClientNotificationOf<"turn/started">
  | AppServerClientNotificationOf<"item/started">
  | AppServerClientNotificationOf<"item/agentMessage/delta">
  | AppServerClientNotificationOf<"item/completed">
  | AppServerClientNotificationOf<"turn/completed">;

type ReviewModeBoundaryItem =
  | {
      type: "enteredReviewMode";
      id: string;
      review: string;
    }
  | {
      type: "exitedReviewMode";
      id: string;
      review: string;
    };

type AgentMessageItem = {
  type: "agentMessage";
  id: string;
  text: string;
  phase: null;
  memoryCitation: null;
};

type StreamingFixture = {
  readonly threadId: string;
  readonly turnId: string;
  readonly agentMessageItemId: string;
  readonly expectedAgentMessageText: string;
  readonly notifications: readonly StreamingFixtureNotification[];
};

function createTurn(turnId: string, status: Turn["status"]): Turn {
  return {
    id: turnId,
    items: [],
    status,
    error: null
  };
}

function createReviewModeBoundaryItem(
  type: ReviewModeBoundaryItem["type"],
  id: string,
  reviewId: string
): ReviewModeBoundaryItem {
  return {
    type,
    id,
    review: reviewId
  };
}

function createAgentMessageItem(id: string, text: string): AgentMessageItem {
  return {
    type: "agentMessage",
    id,
    text,
    phase: null,
    memoryCitation: null
  };
}

const threadId = "thread-streaming-fixture";
const turnId = "turn-streaming-fixture";
const reviewId = "review-fixture-1";
const enteredReviewModeItem = createReviewModeBoundaryItem(
  "enteredReviewMode",
  "item-review-entered",
  reviewId
);
const agentMessageItem = createAgentMessageItem(
  "item-agent-message",
  "Review complete."
);
const exitedReviewModeItem = createReviewModeBoundaryItem(
  "exitedReviewMode",
  "item-review-exited",
  reviewId
);

// The upstream app-server README describes turn progress as a notification
// stream that begins with `turn/started`, emits item lifecycle updates in
// order, and ends with `turn/completed`.
export const documentedTurnStreamingFixture: StreamingFixture = {
  threadId,
  turnId,
  agentMessageItemId: agentMessageItem.id,
  expectedAgentMessageText: agentMessageItem.text,
  notifications: [
    {
      method: "turn/started",
      params: {
        threadId,
        turn: createTurn(turnId, "inProgress")
      }
    },
    {
      method: "item/started",
      params: {
        threadId,
        turnId,
        item: enteredReviewModeItem
      }
    },
    {
      method: "item/completed",
      params: {
        threadId,
        turnId,
        item: enteredReviewModeItem
      }
    },
    {
      method: "item/started",
      params: {
        threadId,
        turnId,
        item: agentMessageItem
      }
    },
    {
      method: "item/agentMessage/delta",
      params: {
        threadId,
        turnId,
        itemId: agentMessageItem.id,
        delta: "Review "
      }
    },
    {
      method: "item/agentMessage/delta",
      params: {
        threadId,
        turnId,
        itemId: agentMessageItem.id,
        delta: "complete."
      }
    },
    {
      method: "item/completed",
      params: {
        threadId,
        turnId,
        item: agentMessageItem
      }
    },
    {
      method: "item/started",
      params: {
        threadId,
        turnId,
        item: exitedReviewModeItem
      }
    },
    {
      method: "item/completed",
      params: {
        threadId,
        turnId,
        item: exitedReviewModeItem
      }
    },
    {
      method: "turn/completed",
      params: {
        threadId,
        turn: createTurn(turnId, "completed")
      }
    }
  ]
};

export function collectAgentMessageDeltaText(
  notifications: readonly StreamingFixtureNotification[],
  itemId: string
): string {
  return notifications
    .flatMap((notification) => {
      if (notification.method !== "item/agentMessage/delta") {
        return [];
      }

      if (notification.params.itemId !== itemId) {
        return [];
      }

      return [notification.params.delta];
    })
    .join("");
}
