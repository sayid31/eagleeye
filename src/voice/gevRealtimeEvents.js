// GevRealtimeController realtime event handling, tool output and visual context.
import { SUPERSEDED_RESPONSE_MEMORY } from './gevRealtimeConstants.js';
import {
  callDedupeKeys,
  extractFunctionCalls,
  parseArguments,
  responseInstructionForToolResult,
} from './gevRealtimeHelpers.js';
import {
  captureViewportImage,
  hasStructuredViewIdentity,
  isBenignViewportDeleteError,
  shouldSendViewportImage,
} from './gevRealtimeViewport.js';
import { readLayerLifecycleSummary } from './gevActions.js';
import { shouldStopVoiceAfterRadioTool } from './gevRealtimeRadioHelpers.js';

export const eventsMixin = {
/**
   * Inject a background MAP EVENT into the conversation as a system item — e.g. a
   * deferred annotation outline that resolved or failed after its tool result
   * already returned. Deliberately NO response.create: the model reads it on its
   * next turn and can confirm or correct without talking over the user. The
   * payload is serialized JSON, so place names stay structured DATA (the same
   * injection hygiene as failedLabels), never instruction-bearing prose.
   */
  notifyMapEvent(payload) {
    if (!this.dc || this.dc.readyState !== 'open') return false;
    return this.sendRealtimeEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [{ type: 'input_text', text: JSON.stringify(payload) }],
      },
    }, 'client.map_event');
  },

sendTextCommand(text) {
    if (!this.dc || this.dc.readyState !== 'open') {
      throw new Error('GEV voice is not connected');
    }
    const cleanText = String(text || '').trim();
    if (!cleanText) return;
    this.cancelRadioHandoff({ abortTools: true });
    this.supersedeActiveResponseForUserTurn();
    const itemEvent = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: cleanText }],
      },
    };
    this.sendRealtimeEvent(itemEvent, 'client.user_text');
    this.requestUserTextResponse();
  },

/**
   * Draw a hard boundary at a typed command: everything the previous response
   * still had in flight is now stale.
   *
   * `cancelRadioHandoff({abortTools:true})` aborts tools already RUNNING, but
   * a function call belonging to the old response can still arrive afterwards
   * and would be dispatched — a stale `fly_to_location` mutating the map after
   * the operator typed "stop". Marking the response superseded refuses those
   * on arrival.
   *
   * The old response's queued follow-up confirmation is dropped for the same
   * reason: the deferred typed turn is the single answer now, and a leftover
   * follow-up would create a second, out-of-order one.
   * @returns {void}
   */
  supersedeActiveResponseForUserTurn() {
    if (this.activeResponseId) {
      this.supersededResponseIds.add(this.activeResponseId);
      // Bounded: only recent responses can still have calls in flight.
      while (this.supersededResponseIds.size > SUPERSEDED_RESPONSE_MEMORY) {
        this.supersededResponseIds.delete(this.supersededResponseIds.values().next().value);
      }
    }
    this.pendingResponseInstructions = null;
  },

/**
   * Whether a function call belongs to a response a newer user turn replaced.
   * @param {string|null} responseId Response the call was emitted under.
   * @returns {boolean} True when the call must not be dispatched.
   */
  isSupersededResponse(responseId) {
    return Boolean(responseId) && this.supersededResponseIds.has(responseId);
  },

/**
   * Ask for an answer to a typed command without colliding with a response
   * already in flight.
   *
   * The Realtime API rejects a second concurrent `response.create`
   * (`conversation_already_has_active_response`) and the rejected turn is
   * simply lost, so the typed command would sit in the conversation with no
   * answer. Every other client trigger goes through `queueResponseCreate`;
   * this was the one path that fired straight out. Deferred rather than
   * dropped: the operator's own command still gets answered, once, when the
   * active response finishes.
   * @returns {void}
   */
  requestUserTextResponse() {
    if (this.responseActive || this.responseCreatePending) {
      this.pendingUserTextResponse = true;
      this.debugLog('response.create.deferred_user_text', {
        responseActive: this.responseActive,
        responseCreatePending: this.responseCreatePending,
      });
      return;
    }
    if (!this.dc || this.dc.readyState !== 'open') return;
    this.pendingUserTextResponse = false;
    this.responseCreatePending = true;
    const sent = this.sendRealtimeEvent({ type: 'response.create' }, 'client.response_create.user_text');
    if (!sent) this.responseCreatePending = false;
  },

async handleRealtimeEvent(event) {
    let payload = null;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    this.debugLog('server.event', {
      type: payload.type,
      eventId: payload.event_id || null,
      responseId: payload.response_id || payload.response?.id || null,
      payload,
    });

    if (payload.type === 'error') {
      if (payload.error?.code === 'conversation_already_has_active_response') {
        this.cancelRadioHandoff({ abortTools: true });
        this.responseActive = true;
        this.responseCreatePending = false;
        this.pendingResponseInstructions = null;
        // Never replay: the rejected turn is dropped, not retried. Re-arming
        // here is how one collision becomes the same sentence twice.
        this.pendingUserTextResponse = false;
        console.warn('[GEV Realtime] Skipped overlapping response.create');
        this.debugLog('response.create.skipped_active', {
          eventId: payload.event_id,
          activeResponseMessage: payload.error?.message || null,
        });
        this.setStatus('listening', 'Ask or command');
        return;
      }
      // A conversation.item.delete for a stale viewport screenshot can land
      // AFTER the server already truncated that item → an item_not_found error.
      // That's a benign race from our own housekeeping, not a session failure —
      // do NOT flip the demo to ERROR (M14). Match either the code or the echoed
      // event_id of a delete we issued.
      if (isBenignViewportDeleteError(payload, this.pendingViewportDeletes)) {
        if (payload.event_id) this.pendingViewportDeletes.delete(payload.event_id);
        console.warn('[GEV Realtime] Ignored stale viewport item_not_found', payload.error?.code || null);
        this.debugLog('viewport_delete.item_not_found', {
          eventId: payload.event_id || null,
          code: payload.error?.code || null,
        });
        return;
      }
      this.responseActive = false;
      this.responseCreatePending = false;
      this.pendingResponseInstructions = null;
      this.pendingUserTextResponse = false;
      this.cancelRadioHandoff({ abortTools: true });
      this.reportError('Realtime API', payload.error, {
        eventId: payload.event_id,
        type: payload.error?.type,
        code: payload.error?.code,
        param: payload.error?.param,
        ...this.connectionDiagnostics(),
      });
      return;
    }

    if (payload.type === 'input_audio_buffer.speech_started') {
      this.userTurnPending = true;
      this.pendingResponseInstructions = null;
      this.cancelRadioHandoff({ abortTools: true });
      this.setVoiceSpeaker('user');
    }
    this.updateResponseState(payload);
    // The spend cap may have just ended the session from inside the usage
    // accounting above. The connection is already closed, so stop here rather
    // than executing tool calls (map side effects) for a session that no longer
    // exists and whose results could never be sent back.
    if (this.isSessionEnding()) return;

    if (payload.type === 'response.done' && this.pendingRadioPlaybackResult) {
      if (payload.response?.status !== 'completed' || this.userTurnPending) {
        this.pendingRadioPlaybackResult = null;
        return;
      }
      // The first response.done closes the tool-call response. Only then may
      // the queued follow-up speak “Turning on the radio.” Keep the prepared
      // result pending until that distinct spoken response also completes.
      if (this.pendingResponseInstructions) {
        this.flushPendingResponse();
        return;
      }
      if (this.isRadioHandoffReserved()) {
        this.radioHandoffDeferredByReservation = true;
        return;
      }
      await this.startPendingRadioHandoff();
      return;
    }

    const calls = extractFunctionCalls(payload);
    if (!calls.length) return;

    // Session-ending latch (spend cap). Function-call events arrive BEFORE the
    // response.done that carries usage, so tools can already be queued when the
    // cap trips. Refuse to dispatch any NEW tool once the session is ending —
    // its results could never be sent back anyway (the data channel is closed).
    // Spend-cap gate, at the dispatch site. `extractFunctionCalls` yields AT
    // MOST ONE call per event (one `response.function_call_arguments.done` or
    // one `response.output_item.done`), so this single check covers the whole
    // batch — there is no reachable mid-batch window, and a per-iteration
    // re-check would be untestable dead code. If the extractor ever returns
    // multiple calls, restore a per-iteration check inside the loop below.
    if (this.isSessionEnding()) {
      this.debugLog('voice.cost.cap.tools_skipped', { skipped: calls.length });
      return;
    }

    const toolResponseId = payload.response_id || payload.response?.id || null;
    // A newer typed command superseded the response these calls belong to.
    // They are stale intent — dispatching one would let the old turn mutate
    // the map after the operator asked for something else.
    //
    // Refusing is not the same as ignoring. Every function call MUST be
    // answered with a `function_call_output`: leaving one unanswered strands a
    // pending call in the conversation and deadlocks the model (the same
    // hazard `callDedupeKeys` is written to avoid). So each refused call gets
    // a terminal output saying plainly that the turn moved on. No
    // `response.create` follows — the deferred typed turn is the single answer.
    if (this.isSupersededResponse(toolResponseId)) {
      this.pruneProcessedCalls();
      for (const call of calls) {
        const keys = callDedupeKeys(call);
        if (keys.some((key) => this.processedCalls.has(key))) continue;
        keys.forEach((key) => this.processedCalls.set(key, performance.now()));
        this.sendToolOutput(call.call_id || call.id, {
          ok: false,
          action: call.name,
          superseded: true,
          error: 'Superseded by a newer command from the operator — this call was not run.',
        });
      }
      this.debugLog('tool.call.skipped_superseded', {
        responseId: toolResponseId,
        skipped: calls.map((call) => call.name),
      });
      return;
    }

    this.setStatus('executing', 'Running command');
    this.pruneProcessedCalls();
    let sentOutput = false;
    let lastResult = null;
    let stopAfterRadioTool = false;
    for (const call of calls) {
      // No per-iteration spend-cap re-check here by design: `calls` holds at
      // most one entry (see the pre-loop gate above), so there is no mid-batch
      // window to guard. Restore one here if extractFunctionCalls ever returns
      // multiple calls.
      const keys = callDedupeKeys(call);
      if (keys.some((key) => this.processedCalls.has(key))) continue;
      keys.forEach((key) => this.processedCalls.set(key, performance.now()));

      let result;
      const resultChannel = this.dc;
      let radioHandoffEpochAtStart = this.radioHandoffEpoch;
      let toolController = null;
      let radioOwnershipClaimed = false;
      let radioReservationToken = null;
      let isRadioFeatureCall = call.name === 'control_radio';
      try {
        const parsedArguments = parseArguments(call.arguments);
        const isRadioControlCall = call.name === 'control_radio';
        const isRadioVisibilityCall = call.name === 'set_layer_visibility'
          && parsedArguments.layerId === 'radio';
        isRadioFeatureCall = isRadioControlCall || isRadioVisibilityCall;
        const radioControlAction = isRadioControlCall
          ? String(parsedArguments.action || '').toLowerCase()
          : null;
        const radioAuthorityDomain = isRadioVisibilityCall
          || ['enable', 'disable'].includes(radioControlAction)
          ? 'visibility'
          : radioControlAction === 'status'
            ? 'query'
            : isRadioControlCall
              ? 'playback'
              : null;
        radioOwnershipClaimed = (
          isRadioControlCall
          && ['disable', 'pause', 'stop'].includes(radioControlAction)
        ) || (isRadioVisibilityCall && parsedArguments.enabled === false);
        if (radioOwnershipClaimed) {
          // Reserve authority by cancelling unsafe underlying work now, but do
          // not advance the committed handoff epoch until this action reports
          // semantic success. A failed stronger action must not suppress an
          // older sibling that already completed valid work.
          radioReservationToken = this.reserveRadioToolHandoff({
            abortScope: radioControlAction === 'disable'
              || (isRadioVisibilityCall && parsedArguments.enabled === false)
              ? 'all'
              : 'playback',
          });
        }
        radioHandoffEpochAtStart = this.radioHandoffEpoch;
        this.debugLog('tool.call', {
          name: call.name,
          callId: call.call_id || call.id || null,
          arguments: parsedArguments,
        });
        toolController = new AbortController();
        // Function-call events from one assistant response can overlap. They
        // are siblings, not superseding turns, so only user-turn/session
        // cancellation aborts them as a group.
        this.activeToolAbortControllers.add(toolController);
        if (isRadioFeatureCall) {
          this.activeRadioToolControllers.set(toolController, {
            responseId: toolResponseId,
            authorityDomain: radioAuthorityDomain,
          });
        }
        result = await this.runner(call.name, parsedArguments, {
          signal: toolController.signal,
          isCurrent: () => (
            this.activeToolAbortControllers.has(toolController)
            && !this.userTurnPending
            && this.dc === resultChannel
            && resultChannel?.readyState === 'open'
            && (radioAuthorityDomain !== 'playback'
              || radioHandoffEpochAtStart === this.radioHandoffEpoch)
          ),
        });
        if (result?.ok && result.radioPlaybackRequested) {
          const sessionIsCurrent = (
            this.activeToolAbortControllers.has(toolController)
            && !this.userTurnPending
            && this.dc === resultChannel
            && resultChannel?.readyState === 'open'
          );
          const handoffIsCurrent = sessionIsCurrent
            && radioHandoffEpochAtStart === this.radioHandoffEpoch;
          const siblingStoppedPlayback = Boolean(
            sessionIsCurrent
            && !handoffIsCurrent
            && toolResponseId
            && this.radioHandoffCancellation?.epoch === this.radioHandoffEpoch
            && this.radioHandoffCancellation?.responseId === toolResponseId,
          );
          if (handoffIsCurrent) {
            this.pendingRadioPlaybackResult = result;
          } else if (siblingStoppedPlayback) {
            // A stop/pause/disable sibling owns the playback outcome, but it
            // does not revoke this tool's already-completed station mutation.
            const authoritativeRadioState = this.radioLayer?.getUIState?.() || {};
            const lifecycleSummary = readLayerLifecycleSummary(this.dataManager, 'radio', {
              fallbackEnabled: authoritativeRadioState.enabled ?? result.enabled,
            });
            result = {
              ...result,
              radioPlaybackRequested: false,
              radioPlaybackSuppressed: true,
              ...lifecycleSummary,
              audioState: authoritativeRadioState.audioState || result.audioState || 'stopped',
            };
          } else {
            result = {
              ...result,
              ok: false,
              radioPlaybackRequested: false,
              cancelled: true,
              error: 'Radio request was superseded by a newer Radio control or voice turn',
            };
          }
        } else if (
          result?.ok
          && result.action === 'control_radio'
          && ['disable', 'pause', 'stop'].includes(result.radioAction)
        ) {
          if (!radioOwnershipClaimed) {
            this.cancelRadioHandoff({
              abortRadioSiblings: result.radioAction === 'stop',
              responseId: toolResponseId,
            });
          }
        }
      } catch (error) {
        const authoritativeRadioState = isRadioFeatureCall
          ? (this.radioLayer?.getUIState?.() || {})
          : null;
        result = {
          ok: false,
          error: error?.message || 'GEV command failed',
          tool: call.name,
          ...(isRadioFeatureCall ? readLayerLifecycleSummary(this.dataManager, 'radio', {
            fallbackEnabled: authoritativeRadioState?.enabled,
          }) : {}),
        };
      } finally {
        if (toolController) {
          this.activeToolAbortControllers.delete(toolController);
          this.activeRadioToolControllers.delete(toolController);
        }
      }
      if (radioReservationToken && result?.ok) {
        // Successful authority commits before its output is serialized. The
        // sibling abort synchronously restores manager ownership, so report
        // that settled authoritative state instead of the transient state the
        // control observed while the older auto-enable was still pending.
        this.settleRadioToolHandoffReservation(radioReservationToken, {
          commit: true,
          responseId: toolResponseId,
        });
        radioReservationToken = null;
        const authoritativeRadioState = this.radioLayer?.getUIState?.() || {};
        const lifecycleSummary = readLayerLifecycleSummary(this.dataManager, 'radio', {
          fallbackEnabled: authoritativeRadioState.enabled ?? result.enabled,
        });
        result = {
          ...result,
          ...lifecycleSummary,
          audioState: authoritativeRadioState.audioState || result.audioState,
          ...(result.radioAction === 'pause' && lifecycleSummary.enabled === false ? { changed: false } : {}),
        };
      }
      this.debugLog('tool.result', {
        name: call.name,
        callId: call.call_id || call.id || null,
        result,
      });
      lastResult = result;
      stopAfterRadioTool = stopAfterRadioTool
        || (
          shouldStopVoiceAfterRadioTool(result)
          && !result.radioPlaybackRequested
          && !result.radioPlaybackSuppressed
        );
      sentOutput = this.sendToolOutput(call.call_id || call.id, result) || sentOutput;
      if (radioReservationToken) {
        // Only failed stronger actions reach this branch. Release after their
        // tool output so resumed playback cannot close the voice channel
        // before the failure is reported.
        this.settleRadioToolHandoffReservation(radioReservationToken, {
          commit: false,
          responseId: toolResponseId,
        });
      }
    }
    if (stopAfterRadioTool) {
      this.stop();
      return;
    }
    if (sentOutput && this.dc?.readyState === 'open') {
      // The viewport-image send is best-effort context. It must never block the
      // response — a throw here would strand the turn at EXECUTING (M13). Guard
      // it so queueResponseCreate always runs, image or not.
      try {
        await this.sendVisualContextIfUseful(lastResult);
      } catch (error) {
        this.debugLog('viewport_context.failed', { error: error?.message || String(error) });
      }
      // Keep the Radio handoff wording authoritative even when another tool
      // result follows Radio in the same multi-intent response.
      this.queueResponseCreate(responseInstructionForToolResult(
        this.pendingRadioPlaybackResult || lastResult,
      ));
    }
    this.setStatus('listening', 'Ask or command');
  },

sendToolOutput(callId, result) {
    if (!callId || !this.dc || this.dc.readyState !== 'open') return false;
    this.sendRealtimeEvent({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(result),
      },
    }, 'client.function_call_output');
    return true;
  },

async sendVisualContextIfUseful(result) {
    if (result?.action !== 'get_entity_context' || !this.dc || this.dc.readyState !== 'open') return false;
    const viewScale = result.scene?.basemap?.viewScale;
    if (!shouldSendViewportImage(viewScale)) return false;
    if (hasStructuredViewIdentity(result)) return false;
    const imageUrl = await captureViewportImage();
    if (!imageUrl) return false;

    // Keep at most one viewport screenshot in context. Images are the single
    // most expensive item (re-billed every turn they linger), so we proactively
    // delete the previous one before adding a new one. Text history is left to
    // the server-side retention_ratio truncation (see /api/realtime/token) —
    // deleting old text per-turn busts the prompt cache for little gain.
    if (this.lastViewportItemId) {
      // Tag the delete with our own event_id and remember it. If the item was
      // already server-truncated, the item_not_found error echoes this id and we
      // recognize it as the benign race it is instead of a fatal error (M14).
      const deleteEventId = `evt_del_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      this.pendingViewportDeletes.add(deleteEventId);
      // Bound the set so a long session can't accumulate ids unbounded.
      if (this.pendingViewportDeletes.size > 8) {
        this.pendingViewportDeletes.delete(this.pendingViewportDeletes.values().next().value);
      }
      this.sendRealtimeEvent({
        event_id: deleteEventId,
        type: 'conversation.item.delete',
        item_id: this.lastViewportItemId,
      }, 'client.conversation.item.delete.old_viewport');
    }

    const newItemId = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const contextEvent = {
      type: 'conversation.item.create',
      item: {
        id: newItemId,
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: "Current EagleEye View viewport screenshot. Read any clearly visible street, building, and place labels in the image and combine them with the structured nearbyPlaces, streetLabels, and scene context. Do not invent labels that are not legible.",
          },
          {
            type: 'input_image',
            image_url: imageUrl,
            detail: 'high',
          },
        ],
      },
    };
    // Only claim lastViewportItemId once the send actually succeeds. If the image
    // is still too large for the data channel, sendRealtimeEvent returns false
    // (it no longer throws — M13); we then leave lastViewportItemId pointing at
    // the item we just deleted as null and fall through so the caller still
    // issues queueResponseCreate WITHOUT the image, instead of stranding the turn.
    const sent = this.sendRealtimeEvent(contextEvent, 'client.viewport_context');
    this.lastViewportItemId = sent ? newItemId : null;
    return sent;
  },
};

