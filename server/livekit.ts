/**
 * LiveKit: real access tokens (JWT) signed with your LiveKit Cloud API secret.
 *
 * Env (all three required):
 *   LIVEKIT_URL         e.g. wss://your-project.livekit.cloud
 *   LIVEKIT_API_KEY
 *   LIVEKIT_API_SECRET
 * Optional:
 *   LIVEKIT_ROOM        default "neuralflow-ops"
 *
 * The API secret never leaves the server; the browser only receives a short-lived token.
 */

import { AccessToken } from 'livekit-server-sdk';
import { randomBytes } from 'node:crypto';

export interface LiveKitTokenResponse {
  configured: boolean;
  reason?: string;
  url?: string;
  token?: string;
  room?: string;
  identity?: string;
}

function livekitUrl(): string | undefined {
  return (process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || '').trim() || undefined;
}

export function livekitConfigured(): boolean {
  return Boolean(livekitUrl() && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
}

export function livekitRoomName(): string {
  return process.env.LIVEKIT_ROOM?.trim() || 'neuralflow-ops';
}

export async function createLiveKitToken(userHint = 'operator'): Promise<LiveKitTokenResponse> {
  const url = livekitUrl();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

  if (!url || !apiKey || !apiSecret) {
    return {
      configured: false,
      reason: 'LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are not all set on the server.',
    };
  }

  // A unique suffix per tab: two connections with the same identity would kick each other out.
  const safe = userHint.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'operator';
  const identity = `${safe}-${randomBytes(3).toString('hex')}`;
  const room = livekitRoomName();

  const at = new AccessToken(apiKey, apiSecret, { identity, name: safe, ttl: '1h' });
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return { configured: true, url, token: await at.toJwt(), room, identity };
}
