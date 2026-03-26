/**
 * CSP Evaluator Engine
 * Ported from Google's CSP Evaluator (Apache 2.0 License)
 * https://github.com/nicktate/csp-evaluator
 *
 * Parses and evaluates Content Security Policies for security issues.
 */

// ── Severity & Finding Types ─────────────────────────────────────

export enum Severity {
  HIGH = 10,
  SYNTAX = 20,
  MEDIUM = 30,
  HIGH_MAYBE = 40,
  STRICT_CSP = 45,
  MEDIUM_MAYBE = 50,
  INFO = 60,
  NONE = 100,
}

export enum FindingType {
  // Parser checks
  MISSING_SEMICOLON = 100,
  UNKNOWN_DIRECTIVE,
  INVALID_KEYWORD,
  NONCE_CHARSET = 106,

  // Security checks
  MISSING_DIRECTIVES = 300,
  SCRIPT_UNSAFE_INLINE,
  SCRIPT_UNSAFE_EVAL,
  PLAIN_URL_SCHEMES,
  PLAIN_WILDCARD,
  SCRIPT_ALLOWLIST_BYPASS,
  OBJECT_ALLOWLIST_BYPASS,
  NONCE_LENGTH,
  IP_SOURCE,
  DEPRECATED_DIRECTIVE,
  SRC_HTTP,
  SRC_NO_PROTOCOL,
  EXPERIMENTAL,
  WILDCARD_URL,
  X_FRAME_OPTIONS_OBSOLETED,
  STYLE_UNSAFE_INLINE,
  STATIC_NONCE,
  SCRIPT_UNSAFE_HASHES,

  // Strict dynamic and backward compatibility
  STRICT_DYNAMIC = 400,
  STRICT_DYNAMIC_NOT_STANDALONE,
  NONCE_HASH,
  UNSAFE_INLINE_FALLBACK,
  ALLOWLIST_FALLBACK,
  IGNORED,

  // Trusted Types
  REQUIRE_TRUSTED_TYPES_FOR_SCRIPTS = 500,

  // Reporting
  REPORTING_DESTINATION_MISSING = 600,
  REPORT_TO_ONLY,
}

export interface Finding {
  type: FindingType;
  description: string;
  severity: Severity;
  directive: string;
  value?: string;
}

export function getHighestSeverity(findings: Finding[]): Severity {
  if (findings.length === 0) return Severity.NONE;
  return findings.reduce(
    (min, f) => (f.severity < min ? f.severity : min),
    Severity.NONE
  );
}

export function severityLabel(s: Severity): string {
  if (s <= Severity.HIGH) return 'High';
  if (s <= Severity.SYNTAX) return 'Syntax';
  if (s <= Severity.MEDIUM) return 'Medium';
  if (s <= Severity.HIGH_MAYBE) return 'Possible High';
  if (s <= Severity.STRICT_CSP) return 'Strict CSP';
  if (s <= Severity.MEDIUM_MAYBE) return 'Possible Medium';
  if (s <= Severity.INFO) return 'Info';
  return 'None';
}

// ── CSP Directives & Keywords ────────────────────────────────────

export enum Directive {
  CHILD_SRC = 'child-src',
  CONNECT_SRC = 'connect-src',
  DEFAULT_SRC = 'default-src',
  FONT_SRC = 'font-src',
  FRAME_SRC = 'frame-src',
  IMG_SRC = 'img-src',
  MEDIA_SRC = 'media-src',
  OBJECT_SRC = 'object-src',
  SCRIPT_SRC = 'script-src',
  SCRIPT_SRC_ATTR = 'script-src-attr',
  SCRIPT_SRC_ELEM = 'script-src-elem',
  STYLE_SRC = 'style-src',
  STYLE_SRC_ATTR = 'style-src-attr',
  STYLE_SRC_ELEM = 'style-src-elem',
  PREFETCH_SRC = 'prefetch-src',
  MANIFEST_SRC = 'manifest-src',
  WORKER_SRC = 'worker-src',
  BASE_URI = 'base-uri',
  PLUGIN_TYPES = 'plugin-types',
  SANDBOX = 'sandbox',
  DISOWN_OPENER = 'disown-opener',
  FORM_ACTION = 'form-action',
  FRAME_ANCESTORS = 'frame-ancestors',
  NAVIGATE_TO = 'navigate-to',
  REPORT_TO = 'report-to',
  REPORT_URI = 'report-uri',
  BLOCK_ALL_MIXED_CONTENT = 'block-all-mixed-content',
  UPGRADE_INSECURE_REQUESTS = 'upgrade-insecure-requests',
  REFLECTED_XSS = 'reflected-xss',
  REFERRER = 'referrer',
  REQUIRE_SRI_FOR = 'require-sri-for',
  TRUSTED_TYPES = 'trusted-types',
  REQUIRE_TRUSTED_TYPES_FOR = 'require-trusted-types-for',
  WEBRTC = 'webrtc',
}

export enum Keyword {
  SELF = "'self'",
  NONE = "'none'",
  UNSAFE_INLINE = "'unsafe-inline'",
  UNSAFE_EVAL = "'unsafe-eval'",
  WASM_EVAL = "'wasm-eval'",
  WASM_UNSAFE_EVAL = "'wasm-unsafe-eval'",
  STRICT_DYNAMIC = "'strict-dynamic'",
  UNSAFE_HASHED_ATTRIBUTES = "'unsafe-hashed-attributes'",
  UNSAFE_HASHES = "'unsafe-hashes'",
  REPORT_SAMPLE = "'report-sample'",
  BLOCK = "'block'",
  ALLOW = "'allow'",
  INLINE_SPECULATION_RULES = "'inline-speculation-rules'",
}

const TRUSTED_TYPES_SINK_SCRIPT = "'script'";

const FETCH_DIRECTIVES: string[] = [
  Directive.CHILD_SRC,
  Directive.CONNECT_SRC,
  Directive.DEFAULT_SRC,
  Directive.FONT_SRC,
  Directive.FRAME_SRC,
  Directive.IMG_SRC,
  Directive.MANIFEST_SRC,
  Directive.MEDIA_SRC,
  Directive.OBJECT_SRC,
  Directive.SCRIPT_SRC,
  Directive.SCRIPT_SRC_ATTR,
  Directive.SCRIPT_SRC_ELEM,
  Directive.STYLE_SRC,
  Directive.STYLE_SRC_ATTR,
  Directive.STYLE_SRC_ELEM,
  Directive.WORKER_SRC,
];

const ALL_DIRECTIVES = new Set(Object.values(Directive));
const ALL_KEYWORDS = new Set(Object.values(Keyword) as string[]);

const NONCE_PATTERN = /^'nonce-(.+)'$/;
const STRICT_NONCE_PATTERN = /^'nonce-[a-zA-Z0-9+/_-]+[=]{0,2}'$/;
const HASH_PATTERN = /^'(sha256|sha384|sha512)-(.+)'$/;
const STRICT_HASH_PATTERN =
  /^'(sha256|sha384|sha512)-[a-zA-Z0-9+/]+[=]{0,2}'$/;

function isDirective(d: string): boolean {
  return ALL_DIRECTIVES.has(d as Directive);
}

function isKeyword(k: string): boolean {
  return ALL_KEYWORDS.has(k);
}

function isUrlScheme(s: string): boolean {
  return /^[a-zA-Z][+a-zA-Z0-9.-]*:$/.test(s);
}

function isNonce(v: string, strict?: boolean): boolean {
  return (strict ? STRICT_NONCE_PATTERN : NONCE_PATTERN).test(v);
}

function isHash(v: string, strict?: boolean): boolean {
  return (strict ? STRICT_HASH_PATTERN : HASH_PATTERN).test(v);
}

// ── CSP Model ────────────────────────────────────────────────────

enum Version {
  CSP1 = 1,
  CSP2,
  CSP3,
}

export class Csp {
  directives: Record<string, string[] | undefined> = {};

  constructor(directives: Record<string, string[] | undefined> = {}) {
    for (const [d, vals] of Object.entries(directives)) {
      if (vals) this.directives[d] = [...vals];
    }
  }

  clone(): Csp {
    return new Csp(this.directives);
  }

  convertToString(): string {
    let s = '';
    for (const [d, vals] of Object.entries(this.directives)) {
      s += d;
      if (vals) {
        for (const v of vals) s += ' ' + v;
      }
      s += '; ';
    }
    return s.trim();
  }

  getEffectiveDirective(directive: string): string {
    if (directive in this.directives) return directive;
    if (
      (directive === Directive.SCRIPT_SRC_ATTR ||
        directive === Directive.SCRIPT_SRC_ELEM) &&
      Directive.SCRIPT_SRC in this.directives
    )
      return Directive.SCRIPT_SRC;
    if (
      (directive === Directive.STYLE_SRC_ATTR ||
        directive === Directive.STYLE_SRC_ELEM) &&
      Directive.STYLE_SRC in this.directives
    )
      return Directive.STYLE_SRC;
    if (FETCH_DIRECTIVES.includes(directive)) return Directive.DEFAULT_SRC;
    return directive;
  }

  getEffectiveDirectives(directives: string[]): string[] {
    return [...new Set(directives.map((d) => this.getEffectiveDirective(d)))];
  }

  policyHasScriptNonces(directive?: string): boolean {
    const d = this.getEffectiveDirective(directive || Directive.SCRIPT_SRC);
    return (this.directives[d] || []).some((v) => isNonce(v));
  }

  policyHasScriptHashes(directive?: string): boolean {
    const d = this.getEffectiveDirective(directive || Directive.SCRIPT_SRC);
    return (this.directives[d] || []).some((v) => isHash(v));
  }

  policyHasStrictDynamic(directive?: string): boolean {
    const d = this.getEffectiveDirective(directive || Directive.SCRIPT_SRC);
    return (this.directives[d] || []).includes(Keyword.STRICT_DYNAMIC);
  }

  getEffectiveCsp(version: Version, optFindings?: Finding[]): Csp {
    const findings = optFindings || [];
    const effective = this.clone();

    for (const dir of [
      Directive.SCRIPT_SRC,
      Directive.SCRIPT_SRC_ATTR,
      Directive.SCRIPT_SRC_ELEM,
    ]) {
      const d = effective.getEffectiveDirective(dir);
      const vals = this.directives[d] || [];
      const eVals = effective.directives[d];

      if (
        eVals &&
        (effective.policyHasScriptNonces(d) ||
          effective.policyHasScriptHashes(d))
      ) {
        if (version >= Version.CSP2) {
          if (vals.includes(Keyword.UNSAFE_INLINE)) {
            arrayRemove(eVals, Keyword.UNSAFE_INLINE);
            findings.push({
              type: FindingType.IGNORED,
              description:
                "unsafe-inline is ignored if a nonce or a hash is present. (CSP2 and above)",
              severity: Severity.NONE,
              directive: d,
              value: Keyword.UNSAFE_INLINE,
            });
          }
        } else {
          for (const v of vals) {
            if (v.startsWith("'nonce-") || v.startsWith("'sha"))
              arrayRemove(eVals, v);
          }
        }
      }

      if (eVals && this.policyHasStrictDynamic(d)) {
        if (version >= Version.CSP3) {
          for (const v of vals) {
            if (
              !v.startsWith("'") ||
              v === Keyword.SELF ||
              v === Keyword.UNSAFE_INLINE
            ) {
              arrayRemove(eVals, v);
              findings.push({
                type: FindingType.IGNORED,
                description:
                  "Because of strict-dynamic this entry is ignored in CSP3 and above",
                severity: Severity.NONE,
                directive: d,
                value: v,
              });
            }
          }
        } else {
          arrayRemove(eVals, Keyword.STRICT_DYNAMIC);
        }
      }
    }

    if (version < Version.CSP3) {
      for (const d of [
        Directive.REPORT_TO,
        Directive.WORKER_SRC,
        Directive.MANIFEST_SRC,
        Directive.TRUSTED_TYPES,
        Directive.REQUIRE_TRUSTED_TYPES_FOR,
        Directive.SCRIPT_SRC_ATTR,
        Directive.SCRIPT_SRC_ELEM,
        Directive.STYLE_SRC_ATTR,
        Directive.STYLE_SRC_ELEM,
      ]) {
        delete effective.directives[d];
      }
    }

    return effective;
  }
}

function arrayRemove<T>(arr: T[], item: T): void {
  const idx = arr.indexOf(item);
  if (idx !== -1) arr.splice(idx, 1);
}

// ── Parser ───────────────────────────────────────────────────────

export function parseCsp(unparsedCsp: string): Csp {
  const csp = new Csp();
  const tokens = unparsedCsp.split(';');

  for (const token of tokens) {
    const parts = token.trim().match(/\S+/g);
    if (!parts) continue;

    const name = parts[0].toLowerCase();
    if (name in csp.directives) continue;

    const values: string[] = [];
    for (let j = 1; j < parts.length; j++) {
      let v = parts[j].trim();
      const lower = v.toLowerCase();
      if (isKeyword(lower) || isUrlScheme(v)) v = lower;
      if (!values.includes(v)) values.push(v);
    }
    csp.directives[name] = values;
  }

  return csp;
}

// ── Utils ────────────────────────────────────────────────────────

function getSchemeFreeUrl(url: string): string {
  return url.replace(/^\w[+\w.-]*:\/\//i, '').replace(/^\/\//, '');
}

function getHostname(url: string): string {
  try {
    const clean = getSchemeFreeUrl(url)
      .replace(':*', '')
      .replace('*', 'wildcard_placeholder');
    const hostname = new URL('https://' + clean).hostname.replace(
      'wildcard_placeholder',
      '*'
    );
    const ipv6 = /^\[[\d:]+\]/;
    if (getSchemeFreeUrl(url).match(ipv6) && !hostname.match(ipv6))
      return '[' + hostname + ']';
    return hostname;
  } catch {
    return url;
  }
}

function matchWildcardUrls(
  cspUrlString: string,
  listOfUrlStrings: string[]
): URL | null {
  try {
    const cspUrl = new URL(
      setScheme(
        cspUrlString.replace(':*', '').replace('*', 'wildcard_placeholder')
      )
    );
    const host = cspUrl.hostname.toLowerCase();
    const hostHasWildcard = host.startsWith('wildcard_placeholder.');
    const wildcardFreeHost = host.replace(/^wildcard_placeholder/i, '');
    const path = cspUrl.pathname;
    const hasPath = path !== '/';

    for (const urlStr of listOfUrlStrings) {
      try {
        const url = new URL(setScheme(urlStr));
        const domain = url.hostname;
        if (!domain.endsWith(wildcardFreeHost)) continue;
        if (!hostHasWildcard && host !== domain) continue;
        if (hasPath) {
          if (path.endsWith('/')) {
            if (!url.pathname.startsWith(path)) continue;
          } else {
            if (url.pathname !== path) continue;
          }
        }
        return url;
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function setScheme(u: string): string {
  if (u.startsWith('//')) return 'https:' + u;
  if (!u.includes('://')) return 'https://' + u;
  return u;
}

function applyCheckToDirectives(
  csp: Csp,
  check: (directive: string, values: string[]) => void
) {
  for (const [d, vals] of Object.entries(csp.directives)) {
    if (vals) check(d, vals);
  }
}

// ── Allowlist Bypass URLs (trimmed) ──────────────────────────────

const ANGULAR_BYPASS_URLS: string[] = [
  '//gstatic.com/fsn/angular_js-bundle1.js',
  '//www.gstatic.com/fsn/angular_js-bundle1.js',
  '//www.googleadservices.com/pageadimg/imgad',
  '//ajax.googleapis.com/ajax/libs/angularjs/1.2.0rc1/angular-route.min.js',
  '//cdnjs.cloudflare.com/ajax/libs/angular.js/1.2.16/angular.min.js',
  '//cdn.jsdelivr.net/angularjs/1.1.2/angular.min.js',
  '//cdn.bootcss.com/angular.js/1.2.0/angular.min.js',
  '//oss.maxcdn.com/angularjs/1.2.20/angular.min.js',
  '//cdn.shopify.com/s/files/1/0225/6463/t/1/assets/angular-animate.min.js',
  '//yandex.st/angularjs/1.2.16/angular-cookies.min.js',
  '//yastatic.net/angularjs/1.2.23/angular.min.js',
  '//storage.googleapis.com/assets-prod.urbansitter.net/us-sym/assets/vendor/angular-sanitize/angular-sanitize.min.js',
];

const JSONP_BYPASS_URLS: string[] = [
  '//www.google-analytics.com/gtm/js',
  '//googleads.g.doubleclick.net/pagead/conversion/1036918760/wcm',
  '//www.googleadservices.com/pagead/conversion/1070110417/wcm',
  '//www.google.com/tools/feedback/escalation-options',
  '//accounts.google.com/o/oauth2/revoke',
  '//cse.google.com/api/007627024705/cse/r3vs7b0fcli/queries/js',
  '//www.googleapis.com/customsearch/v1',
  '//translate.googleapis.com/translate_a/t',
  '//maps.googleapis.com/maps/api/js/GeoPhotoService.GetMetadata',
  '//maps.googleapis.com/maps/api/js/GeoPhotoService.SingleImageSearch',
  '//api.twitter.com/1/statuses/oembed.json',
  '//syndication.twitter.com/widgets/timelines/765840589183213568',
  '//platform.twitter.com/widgets/moment/765840589183213568',
  '//cdn.syndication.twimg.com/widgets/followbutton/info.json',
  '//api.flickr.com/services/feeds/photos_public.gne',
  '//graph.facebook.com/feed',
  '//api.instagram.com/v1/tags/puppy/media/recent',
  '//api.github.com/repos/nicktate/csp-evaluator/contents/main/src',
  '//gist.github.com/nicktate/12345.json',
  '//catalog.library.vanderbilt.edu/ipac20/ipac.jsp',
];

const JSONP_NEEDS_EVAL: string[] = [
  'googletagmanager.com',
  'www.googletagmanager.com',
  'www.googleadservices.com',
  'google-analytics.com',
  'ssl.google-analytics.com',
  'www.google-analytics.com',
];

const FLASH_BYPASS_URLS: string[] = [
  '//vk.com/swf/video.swf',
  '//ajax.googleapis.com/ajax/libs/yui/2.8.0r4/build/charts/assets/charts.swf',
];

// ── Security Checks ──────────────────────────────────────────────

const DIRECTIVES_CAUSING_XSS = [
  Directive.SCRIPT_SRC,
  Directive.SCRIPT_SRC_ATTR,
  Directive.SCRIPT_SRC_ELEM,
  Directive.OBJECT_SRC,
  Directive.BASE_URI,
];

const URL_SCHEMES_CAUSING_XSS = ['data:', 'http:', 'https:'];

type CheckerFn = (csp: Csp) => Finding[];

function checkScriptUnsafeInline(csp: Csp): Finding[] {
  const findings: Finding[] = [];
  for (const d of csp.getEffectiveDirectives([
    Directive.SCRIPT_SRC,
    Directive.SCRIPT_SRC_ATTR,
    Directive.SCRIPT_SRC_ELEM,
  ])) {
    const vals = csp.directives[d] || [];
    if (vals.includes(Keyword.UNSAFE_INLINE))
      findings.push({
        type: FindingType.SCRIPT_UNSAFE_INLINE,
        description:
          "'unsafe-inline' allows the execution of unsafe in-page scripts and event handlers.",
        severity: Severity.HIGH,
        directive: d,
        value: Keyword.UNSAFE_INLINE,
      });
    if (vals.includes(Keyword.UNSAFE_HASHES))
      findings.push({
        type: FindingType.SCRIPT_UNSAFE_HASHES,
        description:
          "'unsafe-hashes' allows execution of unsafe in-page event handlers if their hashes appear in the CSP.",
        severity: Severity.MEDIUM_MAYBE,
        directive: d,
        value: Keyword.UNSAFE_HASHES,
      });
  }
  return findings;
}

function checkScriptUnsafeEval(csp: Csp): Finding[] {
  const findings: Finding[] = [];
  for (const d of csp.getEffectiveDirectives([
    Directive.SCRIPT_SRC,
    Directive.SCRIPT_SRC_ATTR,
    Directive.SCRIPT_SRC_ELEM,
  ])) {
    const vals = csp.directives[d] || [];
    if (vals.includes(Keyword.UNSAFE_EVAL))
      findings.push({
        type: FindingType.SCRIPT_UNSAFE_EVAL,
        description:
          "'unsafe-eval' allows execution of code injected into DOM APIs such as eval().",
        severity: Severity.MEDIUM_MAYBE,
        directive: d,
        value: Keyword.UNSAFE_EVAL,
      });
  }
  return findings;
}

function checkPlainUrlSchemes(csp: Csp): Finding[] {
  const findings: Finding[] = [];
  for (const d of csp.getEffectiveDirectives(DIRECTIVES_CAUSING_XSS)) {
    for (const v of csp.directives[d] || []) {
      if (URL_SCHEMES_CAUSING_XSS.includes(v))
        findings.push({
          type: FindingType.PLAIN_URL_SCHEMES,
          description: `${v} URI in ${d} allows the execution of unsafe scripts.`,
          severity: Severity.HIGH,
          directive: d,
          value: v,
        });
    }
  }
  return findings;
}

function checkWildcards(csp: Csp): Finding[] {
  const findings: Finding[] = [];
  for (const d of csp.getEffectiveDirectives(DIRECTIVES_CAUSING_XSS)) {
    for (const v of csp.directives[d] || []) {
      if (getSchemeFreeUrl(v) === '*')
        findings.push({
          type: FindingType.PLAIN_WILDCARD,
          description: `${d} should not allow '*' as source`,
          severity: Severity.HIGH,
          directive: d,
          value: v,
        });
    }
  }
  return findings;
}

function checkMissingDirectives(csp: Csp): Finding[] {
  const findings: Finding[] = [];

  // Missing object-src
  let objVals: string[] | undefined = [];
  if (Directive.OBJECT_SRC in csp.directives)
    objVals = csp.directives[Directive.OBJECT_SRC];
  else if (Directive.DEFAULT_SRC in csp.directives)
    objVals = csp.directives[Directive.DEFAULT_SRC];
  if (!objVals || objVals.length === 0)
    findings.push({
      type: FindingType.MISSING_DIRECTIVES,
      description:
        "Missing object-src allows the injection of plugins which can execute JavaScript. Set it to 'none'.",
      severity: Severity.HIGH,
      directive: Directive.OBJECT_SRC,
    });

  // Missing script-src
  if (
    !(Directive.SCRIPT_SRC in csp.directives) &&
    !(Directive.DEFAULT_SRC in csp.directives)
  )
    findings.push({
      type: FindingType.MISSING_DIRECTIVES,
      description: 'script-src directive is missing.',
      severity: Severity.HIGH,
      directive: Directive.SCRIPT_SRC,
    });

  // Missing base-uri
  const needsBaseUri =
    csp.policyHasScriptNonces() ||
    (csp.policyHasScriptHashes() && csp.policyHasStrictDynamic());
  if (needsBaseUri && !(Directive.BASE_URI in csp.directives))
    findings.push({
      type: FindingType.MISSING_DIRECTIVES,
      description:
        "Missing base-uri allows injection of base tags to set the base URL for all relative script URLs to an attacker-controlled domain. Set it to 'none' or 'self'.",
      severity: Severity.HIGH,
      directive: Directive.BASE_URI,
    });

  return findings;
}

function checkScriptAllowlistBypass(csp: Csp): Finding[] {
  const findings: Finding[] = [];
  for (const d of csp.getEffectiveDirectives([
    Directive.SCRIPT_SRC,
    Directive.SCRIPT_SRC_ELEM,
  ])) {
    const vals = csp.directives[d] || [];
    if (vals.includes(Keyword.NONE)) continue;

    for (const v of vals) {
      if (v === Keyword.SELF) {
        findings.push({
          type: FindingType.SCRIPT_ALLOWLIST_BYPASS,
          description:
            "'self' can be problematic if you host JSONP, AngularJS or user uploaded files.",
          severity: Severity.MEDIUM_MAYBE,
          directive: d,
          value: v,
        });
        continue;
      }
      if (v.startsWith("'")) continue;
      if (isUrlScheme(v) || !v.includes('.')) continue;

      const url = '//' + getSchemeFreeUrl(v);
      const angularBypass = matchWildcardUrls(url, ANGULAR_BYPASS_URLS);
      let jsonpBypass = matchWildcardUrls(url, JSONP_BYPASS_URLS);

      if (jsonpBypass) {
        const evalRequired = JSONP_NEEDS_EVAL.includes(jsonpBypass.hostname);
        if (evalRequired && !vals.includes(Keyword.UNSAFE_EVAL))
          jsonpBypass = null;
      }

      if (jsonpBypass || angularBypass) {
        let bypassDomain = '';
        let bypassTxt = '';
        if (jsonpBypass) {
          bypassDomain = jsonpBypass.hostname;
          bypassTxt = ' JSONP endpoints';
        }
        if (angularBypass) {
          bypassDomain = angularBypass.hostname;
          bypassTxt += bypassTxt.trim() ? ' and' : '';
          bypassTxt += ' Angular libraries';
        }
        findings.push({
          type: FindingType.SCRIPT_ALLOWLIST_BYPASS,
          description: `${bypassDomain} is known to host${bypassTxt} which allow to bypass this CSP.`,
          severity: Severity.HIGH,
          directive: d,
          value: v,
        });
      } else {
        findings.push({
          type: FindingType.SCRIPT_ALLOWLIST_BYPASS,
          description:
            "No bypass found; make sure that this URL doesn't serve JSONP replies or Angular libraries.",
          severity: Severity.MEDIUM_MAYBE,
          directive: d,
          value: v,
        });
      }
    }
  }
  return findings;
}

function checkFlashObjectAllowlistBypass(csp: Csp): Finding[] {
  const findings: Finding[] = [];
  const d = csp.getEffectiveDirective(Directive.OBJECT_SRC);
  const vals = csp.directives[d] || [];
  const pluginTypes = csp.directives[Directive.PLUGIN_TYPES];
  if (pluginTypes && !pluginTypes.includes('application/x-shockwave-flash'))
    return [];

  for (const v of vals) {
    if (v === Keyword.NONE) return [];
    const url = '//' + getSchemeFreeUrl(v);
    const flashBypass = matchWildcardUrls(url, FLASH_BYPASS_URLS);
    if (flashBypass) {
      findings.push({
        type: FindingType.OBJECT_ALLOWLIST_BYPASS,
        description: `${flashBypass.hostname} is known to host Flash files which allow to bypass this CSP.`,
        severity: Severity.HIGH,
        directive: d,
        value: v,
      });
    } else if (d === Directive.OBJECT_SRC) {
      findings.push({
        type: FindingType.OBJECT_ALLOWLIST_BYPASS,
        description: "Can you restrict object-src to 'none' only?",
        severity: Severity.MEDIUM_MAYBE,
        directive: d,
        value: v,
      });
    }
  }
  return findings;
}

function looksLikeIpAddress(maybeIp: string): boolean {
  if (maybeIp.startsWith('[') && maybeIp.endsWith(']')) return true;
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(maybeIp);
}

function checkIpSource(csp: Csp): Finding[] {
  const findings: Finding[] = [];
  applyCheckToDirectives(csp, (d, vals) => {
    for (const v of vals) {
      const host = getHostname(v);
      if (looksLikeIpAddress(host)) {
        findings.push({
          type: FindingType.IP_SOURCE,
          description:
            host === '127.0.0.1'
              ? `${d} directive allows localhost as source. Remove this in production.`
              : `${d} directive has an IP-Address as source: ${host} (will be ignored by browsers!).`,
          severity: Severity.INFO,
          directive: d,
          value: v,
        });
      }
    }
  });
  return findings;
}

function checkNonceLength(csp: Csp): Finding[] {
  const findings: Finding[] = [];
  applyCheckToDirectives(csp, (d, vals) => {
    for (const v of vals) {
      const match = v.match(NONCE_PATTERN);
      if (!match) continue;
      if (match[1].length < 8)
        findings.push({
          type: FindingType.NONCE_LENGTH,
          description: 'Nonces should be at least 8 characters long.',
          severity: Severity.MEDIUM,
          directive: d,
          value: v,
        });
      if (!isNonce(v, true))
        findings.push({
          type: FindingType.NONCE_CHARSET,
          description: 'Nonces should only use the base64 charset.',
          severity: Severity.INFO,
          directive: d,
          value: v,
        });
    }
  });
  return findings;
}

function checkSrcHttp(csp: Csp): Finding[] {
  const findings: Finding[] = [];
  applyCheckToDirectives(csp, (d, vals) => {
    for (const v of vals) {
      if (v.startsWith('http://'))
        findings.push({
          type: FindingType.SRC_HTTP,
          description:
            d === Directive.REPORT_URI
              ? 'Use HTTPS to send violation reports securely.'
              : 'Allow only resources downloaded over HTTPS.',
          severity: Severity.MEDIUM,
          directive: d,
          value: v,
        });
    }
  });
  return findings;
}

function checkDeprecatedDirective(csp: Csp): Finding[] {
  const findings: Finding[] = [];
  if (Directive.REFLECTED_XSS in csp.directives)
    findings.push({
      type: FindingType.DEPRECATED_DIRECTIVE,
      description:
        'reflected-xss is deprecated since CSP2. Use the X-XSS-Protection header instead.',
      severity: Severity.INFO,
      directive: Directive.REFLECTED_XSS,
    });
  if (Directive.REFERRER in csp.directives)
    findings.push({
      type: FindingType.DEPRECATED_DIRECTIVE,
      description:
        'referrer is deprecated since CSP2. Use the Referrer-Policy header instead.',
      severity: Severity.INFO,
      directive: Directive.REFERRER,
    });
  if (Directive.DISOWN_OPENER in csp.directives)
    findings.push({
      type: FindingType.DEPRECATED_DIRECTIVE,
      description:
        'disown-opener is deprecated since CSP3. Use the Cross Origin Opener Policy header instead.',
      severity: Severity.INFO,
      directive: Directive.DISOWN_OPENER,
    });
  if (Directive.PREFETCH_SRC in csp.directives)
    findings.push({
      type: FindingType.DEPRECATED_DIRECTIVE,
      description:
        'prefetch-src is deprecated since CSP3. This feature may cease to work at any time.',
      severity: Severity.INFO,
      directive: Directive.PREFETCH_SRC,
    });
  return findings;
}

// ── Parser Checks ────────────────────────────────────────────────

function checkUnknownDirective(csp: Csp): Finding[] {
  const findings: Finding[] = [];
  for (const d of Object.keys(csp.directives)) {
    if (isDirective(d)) continue;
    findings.push({
      type: FindingType.UNKNOWN_DIRECTIVE,
      description: d.endsWith(':')
        ? "CSP directives don't end with a colon."
        : `Directive "${d}" is not a known CSP directive.`,
      severity: Severity.SYNTAX,
      directive: d,
    });
  }
  return findings;
}

function checkMissingSemicolon(csp: Csp): Finding[] {
  const findings: Finding[] = [];
  for (const [d, vals] of Object.entries(csp.directives)) {
    if (!vals) continue;
    for (const v of vals) {
      if (isDirective(v))
        findings.push({
          type: FindingType.MISSING_SEMICOLON,
          description: `Did you forget the semicolon? "${v}" seems to be a directive, not a value.`,
          severity: Severity.SYNTAX,
          directive: d,
          value: v,
        });
    }
  }
  return findings;
}

function checkInvalidKeyword(csp: Csp): Finding[] {
  const findings: Finding[] = [];
  const keywordsNoTicks = Object.values(Keyword).map((k) =>
    k.replace(/'/g, '')
  );

  for (const [d, vals] of Object.entries(csp.directives)) {
    if (!vals) continue;
    for (const v of vals) {
      if (
        keywordsNoTicks.includes(v) ||
        v.startsWith('nonce-') ||
        /^(sha256|sha384|sha512)-/.test(v)
      ) {
        findings.push({
          type: FindingType.INVALID_KEYWORD,
          description: `Did you forget to surround "${v}" with single-ticks?`,
          severity: Severity.SYNTAX,
          directive: d,
          value: v,
        });
        continue;
      }
      if (!v.startsWith("'")) continue;
      if (d === Directive.REQUIRE_TRUSTED_TYPES_FOR) {
        if (v === TRUSTED_TYPES_SINK_SCRIPT) continue;
      } else if (d === Directive.TRUSTED_TYPES) {
        if (v === "'allow-duplicates'" || v === "'none'") continue;
      } else {
        if (isKeyword(v) || isHash(v) || isNonce(v)) continue;
      }
      findings.push({
        type: FindingType.INVALID_KEYWORD,
        description: `${v} seems to be an invalid CSP keyword.`,
        severity: Severity.SYNTAX,
        directive: d,
        value: v,
      });
    }
  }
  return findings;
}

// ── Strict CSP Checks ────────────────────────────────────────────

function checkStrictDynamic(csp: Csp): Finding[] {
  const d = csp.getEffectiveDirective(Directive.SCRIPT_SRC);
  const vals = csp.directives[d] || [];
  const hasSchemeOrHost = vals.some((v) => !v.startsWith("'"));
  if (hasSchemeOrHost && !vals.includes(Keyword.STRICT_DYNAMIC))
    return [
      {
        type: FindingType.STRICT_DYNAMIC,
        description:
          "Host allowlists can frequently be bypassed. Consider using 'strict-dynamic' in combination with CSP nonces or hashes.",
        severity: Severity.STRICT_CSP,
        directive: d,
      },
    ];
  return [];
}

function checkStrictDynamicNotStandalone(csp: Csp): Finding[] {
  const d = csp.getEffectiveDirective(Directive.SCRIPT_SRC);
  const vals = csp.directives[d] || [];
  if (
    vals.includes(Keyword.STRICT_DYNAMIC) &&
    !csp.policyHasScriptNonces() &&
    !csp.policyHasScriptHashes()
  )
    return [
      {
        type: FindingType.STRICT_DYNAMIC_NOT_STANDALONE,
        description:
          "'strict-dynamic' without a CSP nonce/hash will block all scripts.",
        severity: Severity.INFO,
        directive: d,
      },
    ];
  return [];
}

function checkUnsafeInlineFallback(csp: Csp): Finding[] {
  if (!csp.policyHasScriptNonces() && !csp.policyHasScriptHashes()) return [];
  const d = csp.getEffectiveDirective(Directive.SCRIPT_SRC);
  const vals = csp.directives[d] || [];
  if (!vals.includes(Keyword.UNSAFE_INLINE))
    return [
      {
        type: FindingType.UNSAFE_INLINE_FALLBACK,
        description:
          "Consider adding 'unsafe-inline' (ignored by browsers supporting nonces/hashes) to be backward compatible with older browsers.",
        severity: Severity.STRICT_CSP,
        directive: d,
      },
    ];
  return [];
}

function checkAllowlistFallback(csp: Csp): Finding[] {
  const d = csp.getEffectiveDirective(Directive.SCRIPT_SRC);
  const vals = csp.directives[d] || [];
  if (!vals.includes(Keyword.STRICT_DYNAMIC)) return [];
  if (
    !vals.some(
      (v) => ['http:', 'https:', '*'].includes(v) || v.includes('.')
    )
  )
    return [
      {
        type: FindingType.ALLOWLIST_FALLBACK,
        description:
          "Consider adding https: and http: url schemes (ignored by browsers supporting 'strict-dynamic') for backward compatibility.",
        severity: Severity.STRICT_CSP,
        directive: d,
      },
    ];
  return [];
}

function checkRequiresTrustedTypes(csp: Csp): Finding[] {
  const d = csp.getEffectiveDirective(Directive.REQUIRE_TRUSTED_TYPES_FOR);
  const vals = csp.directives[d] || [];
  if (!vals.includes(TRUSTED_TYPES_SINK_SCRIPT))
    return [
      {
        type: FindingType.REQUIRE_TRUSTED_TYPES_FOR_SCRIPTS,
        description:
          'Consider requiring Trusted Types for scripts to lock down DOM XSS injection sinks. Add "require-trusted-types-for \'script\'" to your policy.',
        severity: Severity.INFO,
        directive: Directive.REQUIRE_TRUSTED_TYPES_FOR,
      },
    ];
  return [];
}

// ── Evaluator ────────────────────────────────────────────────────

const DEFAULT_CHECKS: CheckerFn[] = [
  checkScriptUnsafeInline,
  checkScriptUnsafeEval,
  checkPlainUrlSchemes,
  checkWildcards,
  checkMissingDirectives,
  checkScriptAllowlistBypass,
  checkFlashObjectAllowlistBypass,
  checkIpSource,
  checkNonceLength,
  checkSrcHttp,
  checkDeprecatedDirective,
  checkUnknownDirective,
  checkMissingSemicolon,
  checkInvalidKeyword,
];

const STRICT_CHECKS: CheckerFn[] = [
  checkStrictDynamic,
  checkStrictDynamicNotStandalone,
  checkUnsafeInlineFallback,
  checkAllowlistFallback,
  checkRequiresTrustedTypes,
];

export function evaluateCsp(unparsedCsp: string): {
  csp: Csp;
  findings: Finding[];
} {
  const parsed = parseCsp(unparsedCsp);
  const findings: Finding[] = [];
  const version = Version.CSP3;
  const effectiveCsp = parsed.getEffectiveCsp(version, findings);

  // Strict CSP checks run on parsed CSP (not effective)
  for (const check of STRICT_CHECKS) {
    findings.push(...check(parsed));
  }

  // Security & parser checks run on effective CSP
  for (const check of DEFAULT_CHECKS) {
    findings.push(...check(effectiveCsp));
  }

  // Filter out NONE severity (informational about ignored entries)
  const meaningful = findings.filter((f) => f.severity !== Severity.NONE);

  return { csp: parsed, findings: meaningful };
}

// ── Directive metadata ───────────────────────────────────────────

export const DIRECTIVE_DESCRIPTIONS: Record<string, string> = {
  'default-src': 'Fallback for other fetch directives',
  'script-src': 'Controls script sources',
  'script-src-elem': 'Controls <script> element sources',
  'script-src-attr': 'Controls inline event handler sources',
  'style-src': 'Controls stylesheet sources',
  'style-src-elem': 'Controls <style> element sources',
  'style-src-attr': 'Controls inline style attribute sources',
  'img-src': 'Controls image sources',
  'font-src': 'Controls font sources',
  'connect-src': 'Controls fetch/XHR/WebSocket sources',
  'media-src': 'Controls media (audio/video) sources',
  'object-src': 'Controls plugin sources (Flash, etc.)',
  'frame-src': 'Controls iframe sources',
  'child-src': 'Controls web worker and iframe sources',
  'worker-src': 'Controls web worker sources',
  'frame-ancestors': 'Controls which sites can embed this page',
  'form-action': 'Controls form submission targets',
  'base-uri': 'Controls <base> element URLs',
  'manifest-src': 'Controls manifest sources',
  'prefetch-src': 'Controls prefetch/prerender sources',
  'navigate-to': 'Controls navigation targets',
  'report-uri': 'URL to send violation reports',
  'report-to': 'Reporting API group for violations',
  'sandbox': 'Enables sandbox for the page',
  'plugin-types': 'Restricts plugin MIME types',
  'block-all-mixed-content': 'Blocks mixed content',
  'upgrade-insecure-requests': 'Upgrades HTTP to HTTPS',
  'require-trusted-types-for': 'Enforces Trusted Types',
  'trusted-types': 'Restricts Trusted Type policies',
};
