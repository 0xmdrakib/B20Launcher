export type WorkflowPhase =
  | "editing"
  | "stagingMetadata"
  | "metadataStaged"
  | "buildingTransaction"
  | "transactionReady"
  | "awaitingWallet"
  | "prepublishing"
  | "submitted"
  | "confirming"
  | "publishingMetadata"
  | "complete"
  | "recoverableError";

export type WorkflowState = {
  phase: WorkflowPhase;
  epoch: number;
  txHash: string | undefined;
  error: string | undefined;
  retryAttempt: number;
};

export const initialWorkflowState: WorkflowState = {
  phase: "editing",
  epoch: 0,
  txHash: undefined,
  error: undefined,
  retryAttempt: 0
};

export type WorkflowEvent =
  | { type: "EDIT" }
  | { type: "RESET" }
  | { type: "STAGE_METADATA" }
  | { type: "METADATA_STAGED" }
  | { type: "BUILD_TRANSACTION" }
  | { type: "TRANSACTION_READY" }
  | { type: "AWAIT_WALLET" }
  | { type: "PREPUBLISH" }
  | { type: "SUBMITTED"; txHash: string }
  | { type: "CONFIRMING" }
  | { type: "PUBLISH_METADATA"; retryAttempt?: number }
  | { type: "COMPLETE" }
  | { type: "ERROR"; error: string }
  | { type: "CLEAR_ERROR" };

/**
 * The launch workflow is deliberately pure. Network responses are applied by
 * the UI only when their captured epoch still matches the current state.
 */
export function launchWorkflowReducer(state: WorkflowState, event: WorkflowEvent): WorkflowState {
  switch (event.type) {
    case "EDIT":
    case "RESET":
      return {
        phase: "editing",
        epoch: state.epoch + 1,
        txHash: undefined,
        error: undefined,
        retryAttempt: 0
      };
    case "STAGE_METADATA":
      return { ...state, phase: "stagingMetadata", error: undefined };
    case "METADATA_STAGED":
      return { ...state, phase: "metadataStaged", error: undefined };
    case "BUILD_TRANSACTION":
      return { ...state, phase: "buildingTransaction", error: undefined };
    case "TRANSACTION_READY":
      return { ...state, phase: "transactionReady", error: undefined };
    case "AWAIT_WALLET":
      return { ...state, phase: "awaitingWallet", error: undefined };
    case "PREPUBLISH":
      return { ...state, phase: "prepublishing", error: undefined };
    case "SUBMITTED":
      return { ...state, phase: "submitted", txHash: event.txHash, error: undefined };
    case "CONFIRMING":
      return { ...state, phase: "confirming", error: undefined };
    case "PUBLISH_METADATA":
      return {
        ...state,
        phase: "publishingMetadata",
        retryAttempt: event.retryAttempt ?? state.retryAttempt,
        error: undefined
      };
    case "COMPLETE":
      return { ...state, phase: "complete", error: undefined };
    case "ERROR":
      return { ...state, phase: "recoverableError", error: event.error };
    case "CLEAR_ERROR":
      return { ...state, error: undefined };
    default:
      return state;
  }
}

export type StepStatus = "current" | "complete" | "available";

export function stepStatuses(current: number, completed: boolean[]): StepStatus[] {
  return completed.map((done, index) => (done ? "complete" : index === current ? "current" : "available"));
}

export type TokenLifecycleStatus = "Draft" | "Staged" | "Transaction ready" | "Submitted" | "Live";

export function tokenLifecycleStatus(input: {
  metadataReady: boolean;
  transactionReady: boolean;
  submitted: boolean;
  complete: boolean;
}): TokenLifecycleStatus {
  if (input.complete) return "Live";
  if (input.submitted) return "Submitted";
  if (input.transactionReady) return "Transaction ready";
  if (input.metadataReady) return "Staged";
  return "Draft";
}
