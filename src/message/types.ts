/**
 * The composer's output format.
 *
 * This module is the seam described in the spec: the composer produces a
 * `Message` and knows nothing about who consumes it. Adapters (see
 * `./adapters`) turn a `Message` into whatever a concrete target expects.
 * Nothing here may import React, Tauri or terminal code.
 */

export type Attachment =
  | {
      type: "image";
      id: string;
      path: string;
      name: string;
      mimeType: string;
    }
  | {
      type: "file";
      id: string;
      path: string;
      name: string;
      mimeType?: string;
      size?: number;
    };

export type Block =
  | { type: "text"; text: string }
  | { type: "image"; path: string; name: string }
  | { type: "file"; path: string; name: string };

export interface Message {
  blocks: Block[];
}

export function isEmptyMessage(message: Message): boolean {
  return message.blocks.every(
    (block) => block.type === "text" && block.text.trim() === "",
  );
}
