import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export function getWhopClient() {
  return {
    request(path: string, init: { method: string; headers?: Record<string, string>; body?: string }) {
      return connectors.proxy("whop", path, init);
    },
  };
}
