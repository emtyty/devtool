import { z } from "zod";
import type { Tool, ToolResult } from "../registry.js";

function ipToLong(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function longToIp(num: number): string {
  return [(num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff].join(".");
}

function prefixToMask(prefix: number): number {
  if (prefix === 0) return 0;
  return (~0 << (32 - prefix)) >>> 0;
}

function maskToPrefix(mask: number): number {
  let count = 0;
  let m = mask;
  while (m & 0x80000000) {
    count++;
    m = (m << 1) >>> 0;
  }
  return count;
}

function getSubnetInfo(ip: string, prefix: number) {
  const ipNum = ipToLong(ip);
  const mask = prefixToMask(prefix);
  const network = (ipNum & mask) >>> 0;
  const broadcast = (network | ~mask) >>> 0;
  const firstHost = prefix >= 31 ? network : (network + 1) >>> 0;
  const lastHost = prefix >= 31 ? broadcast : (broadcast - 1) >>> 0;
  const totalHosts = prefix >= 31 ? (prefix === 32 ? 1 : 2) : Math.pow(2, 32 - prefix) - 2;
  const wildcard = (~mask) >>> 0;

  // Determine class
  const firstOctet = (ipNum >>> 24) & 0xff;
  let ipClass: string;
  if (firstOctet < 128) ipClass = "A";
  else if (firstOctet < 192) ipClass = "B";
  else if (firstOctet < 224) ipClass = "C";
  else if (firstOctet < 240) ipClass = "D (Multicast)";
  else ipClass = "E (Reserved)";

  // Private range check
  let isPrivate = false;
  if ((ipNum & 0xff000000) === 0x0a000000) isPrivate = true; // 10.0.0.0/8
  else if ((ipNum & 0xfff00000) === 0xac100000) isPrivate = true; // 172.16.0.0/12
  else if ((ipNum & 0xffff0000) === 0xc0a80000) isPrivate = true; // 192.168.0.0/16
  else if ((ipNum & 0xff000000) === 0x7f000000) isPrivate = true; // 127.0.0.0/8

  return {
    ip,
    cidr: `${longToIp(network)}/${prefix}`,
    networkAddress: longToIp(network),
    broadcastAddress: longToIp(broadcast),
    subnetMask: longToIp(mask),
    wildcardMask: longToIp(wildcard),
    firstHost: longToIp(firstHost),
    lastHost: longToIp(lastHost),
    totalHosts,
    prefix,
    class: ipClass,
    isPrivate,
    binaryMask: mask.toString(2).padStart(32, "0").replace(/(.{8})/g, "$1.").slice(0, -1),
  };
}

function isIpInSubnet(ip: string, network: string, prefix: number): boolean {
  const ipNum = ipToLong(ip);
  const netNum = ipToLong(network);
  const mask = prefixToMask(prefix);
  return (ipNum & mask) === (netNum & mask);
}

export const tool: Tool = {
  name: "ip_subnet",
  description:
    "IPv4 subnet calculator — compute network address, broadcast, host range, subnet mask, wildcard mask, CIDR notation, and total hosts. Check if an IP belongs to a subnet. Supports CIDR notation (e.g., 192.168.1.0/24) or IP + subnet mask. Call this tool for network calculations. Claude frequently makes subnet math errors — this tool provides exact bit-level calculations.",
  schema: z.object({
    ip: z.string().describe("IPv4 address, optionally with CIDR prefix (e.g., '192.168.1.100/24' or '10.0.0.1')"),
    mask: z
      .string()
      .optional()
      .describe("Subnet mask (e.g., '255.255.255.0') or prefix length (e.g., '24'). Optional if CIDR notation used in ip."),
    checkIp: z
      .string()
      .optional()
      .describe("Optional: check if this IP address belongs to the calculated subnet"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ ip, mask, checkIp }): Promise<ToolResult> => {
    const rawIp = (ip as string)?.trim();
    if (!rawIp) return { success: false, error: "IP address is required" };

    let address: string;
    let prefix: number;

    try {
      // Parse CIDR notation
      if (rawIp.includes("/")) {
        const [addr, pfx] = rawIp.split("/");
        address = addr;
        prefix = parseInt(pfx, 10);
        if (isNaN(prefix) || prefix < 0 || prefix > 32) {
          return { success: false, error: `Invalid prefix length: ${pfx}` };
        }
      } else if (mask) {
        address = rawIp;
        const rawMask = (mask as string).trim();
        // Check if mask is a number (prefix) or dotted notation
        if (/^\d+$/.test(rawMask)) {
          prefix = parseInt(rawMask, 10);
          if (prefix < 0 || prefix > 32) {
            return { success: false, error: `Invalid prefix length: ${rawMask}` };
          }
        } else {
          // Dotted mask
          const maskNum = ipToLong(rawMask);
          prefix = maskToPrefix(maskNum);
        }
      } else {
        address = rawIp;
        prefix = 24; // default /24
      }

      const info = getSubnetInfo(address, prefix);

      const result: Record<string, unknown> = { ...info };

      // Check IP membership
      if (checkIp) {
        const check = (checkIp as string).trim();
        const belongs = isIpInSubnet(check, info.networkAddress, prefix);
        result.checkResult = {
          ip: check,
          belongsToSubnet: belongs,
          subnet: info.cidr,
        };
      }

      const summaryLines = [
        `CIDR:        ${info.cidr}`,
        `Network:     ${info.networkAddress}`,
        `Broadcast:   ${info.broadcastAddress}`,
        `Subnet Mask: ${info.subnetMask}`,
        `Wildcard:    ${info.wildcardMask}`,
        `Host Range:  ${info.firstHost} — ${info.lastHost}`,
        `Total Hosts: ${info.totalHosts.toLocaleString()}`,
        `Class:       ${info.class} | Private: ${info.isPrivate ? "Yes" : "No"}`,
      ];

      if (result.checkResult) {
        const cr = result.checkResult as { ip: string; belongsToSubnet: boolean };
        summaryLines.push(`\nCheck: ${cr.ip} ${cr.belongsToSubnet ? "BELONGS to" : "NOT in"} ${info.cidr}`);
      }

      return {
        success: true,
        data: result,
        summary: summaryLines.join("\n"),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Invalid input",
      };
    }
  },
};
