import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness";
import { fromBase64, toBase64 } from "lib0/buffer";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Minimal Yjs <-> Supabase Realtime provider.
 * One provider per (room, file). Uses one broadcast channel per file.
 */
export class SupabaseYProvider {
  doc: Y.Doc;
  awareness: Awareness;
  channel: RealtimeChannel;
  private destroyed = false;
  private clientId: string;

  constructor(roomId: string, fileId: string, doc: Y.Doc) {
    this.doc = doc;
    this.awareness = new Awareness(doc);
    this.clientId = crypto.randomUUID();

    this.channel = supabase.channel(`yfile-${roomId}-${fileId}`, {
      config: { broadcast: { self: false } },
    });

    // Local doc updates → broadcast
    doc.on("update", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);

    this.channel
      .on("broadcast", { event: "y-update" }, ({ payload }) => {
        try { Y.applyUpdate(doc, fromBase64(payload.update), this); } catch (e) { console.warn("Failed to apply y-update", e); }
      })
      .on("broadcast", { event: "y-awareness" }, ({ payload }) => {
        try { applyAwarenessUpdate(this.awareness, fromBase64(payload.update), this); } catch (e) { console.warn("Failed to apply y-awareness", e); }
      })
      .on("broadcast", { event: "y-sync-request" }, () => {
        // Send full state to newcomer
        const update = Y.encodeStateAsUpdate(doc);
        this.channel.send({
          type: "broadcast",
          event: "y-update",
          payload: { update: toBase64(update) },
        });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && !this.destroyed) {
          // Ask others for their state
          this.channel.send({
            type: "broadcast",
            event: "y-sync-request",
            payload: { from: this.clientId },
          });
        }
      });
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return;
    this.channel.send({
      type: "broadcast",
      event: "y-update",
      payload: { update: toBase64(update) },
    });
  };

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === this) return;
    const changed = added.concat(updated, removed);
    const update = encodeAwarenessUpdate(this.awareness, changed);
    this.channel.send({
      type: "broadcast",
      event: "y-awareness",
      payload: { update: toBase64(update) },
    });
  };

  destroy() {
    this.destroyed = true;
    this.doc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    supabase.removeChannel(this.channel);
  }
}
