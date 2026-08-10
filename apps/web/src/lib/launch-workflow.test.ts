import { describe, expect, it } from "vitest";
import {
  initialWorkflowState,
  launchWorkflowReducer,
  stepStatuses,
  tokenLifecycleStatus
} from "./launch-workflow";

describe("launch workflow", () => {
  it("advances through the typed transaction lifecycle", () => {
    let state = launchWorkflowReducer(initialWorkflowState, { type: "STAGE_METADATA" });
    state = launchWorkflowReducer(state, { type: "METADATA_STAGED" });
    state = launchWorkflowReducer(state, { type: "BUILD_TRANSACTION" });
    state = launchWorkflowReducer(state, { type: "TRANSACTION_READY" });
    state = launchWorkflowReducer(state, { type: "AWAIT_WALLET" });
    state = launchWorkflowReducer(state, { type: "SUBMITTED", txHash: "0xabc" });
    state = launchWorkflowReducer(state, { type: "CONFIRMING" });
    state = launchWorkflowReducer(state, { type: "PUBLISH_METADATA" });
    state = launchWorkflowReducer(state, { type: "COMPLETE" });
    expect(state.phase).toBe("complete");
    expect(state.txHash).toBe("0xabc");
  });

  it("increments the epoch and clears stale transaction state on edit/reset", () => {
    const submitted = launchWorkflowReducer(initialWorkflowState, { type: "SUBMITTED", txHash: "0xabc" });
    const edited = launchWorkflowReducer(submitted, { type: "EDIT" });
    expect(edited.epoch).toBe(1);
    expect(edited.phase).toBe("editing");
    expect(edited.txHash).toBeUndefined();
    expect(launchWorkflowReducer(edited, { type: "RESET" }).epoch).toBe(2);
  });

  it("derives step completion from validation, not the visited step", () => {
    expect(stepStatuses(3, [true, false, false, false])).toEqual(["complete", "available", "available", "current"]);
  });

  it("never calls an incomplete preview Live", () => {
    expect(tokenLifecycleStatus({ metadataReady: false, transactionReady: false, submitted: false, complete: false })).toBe("Draft");
    expect(tokenLifecycleStatus({ metadataReady: true, transactionReady: false, submitted: false, complete: false })).toBe("Staged");
    expect(tokenLifecycleStatus({ metadataReady: true, transactionReady: true, submitted: false, complete: false })).toBe("Transaction ready");
    expect(tokenLifecycleStatus({ metadataReady: true, transactionReady: true, submitted: true, complete: false })).toBe("Submitted");
    expect(tokenLifecycleStatus({ metadataReady: true, transactionReady: true, submitted: true, complete: true })).toBe("Live");
  });
});
