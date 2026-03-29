/**
 * generate-tech-doc.js
 * Generates the NSBP Radio technical documentation as a .docx file.
 * Run: node generate-tech-doc.js
 * Output: NSBP-Radio-Technical-Documentation.docx
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  Header, Footer, PageNumber, LevelFormat, TableOfContents,
  ExternalHyperlink, PageBreak, VerticalAlign,
} = require("/opt/homebrew/lib/node_modules/docx");
const fs = require("fs");

// ── Colour palette ──────────────────────────────────────────────────────────
const ORANGE   = "FF9D1A";   // NSBP brand orange
const DARK     = "1A1A2E";   // Near-black (used for heading backgrounds)
const MID      = "2D2D44";   // Dark panel colour
const LIGHT_BG = "F5F5F5";   // Light grey for alternating table rows
const BLUE     = "2563EB";   // Accent blue for diagram boxes
const GREEN    = "16A34A";   // Accent green
const PURPLE   = "7C3AED";   // Accent purple
const WHITE    = "FFFFFF";

// ── Shared border definition ────────────────────────────────────────────────
const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders    = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
const noBorder   = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders  = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

// ── Helper: heading paragraph ───────────────────────────────────────────────
function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
}

// ── Helper: body paragraph ──────────────────────────────────────────────────
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 160 },
    children: [new TextRun({ text, font: "Arial", size: 22, ...opts })],
  });
}

// ── Helper: bold inline run ─────────────────────────────────────────────────
function bold(text) { return new TextRun({ text, bold: true, font: "Arial", size: 22 }); }
function mono(text) { return new TextRun({ text, font: "Courier New", size: 20 }); }
function run(text, opts = {}) { return new TextRun({ text, font: "Arial", size: 22, ...opts }); }

// ── Helper: paragraph with mixed runs ──────────────────────────────────────
function mixedP(runs, opts = {}) {
  return new Paragraph({ spacing: { after: 160 }, children: runs, ...opts });
}

// ── Helper: bullet paragraph ────────────────────────────────────────────────
function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 80 },
    children: [new TextRun({ text, font: "Arial", size: 22 })],
  });
}
function bulletMixed(runs, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 80 },
    children: runs,
  });
}

// ── Helper: blank line ──────────────────────────────────────────────────────
function blank() {
  return new Paragraph({ spacing: { after: 80 }, children: [new TextRun("")] });
}

// ── Helper: horizontal rule (paragraph bottom border) ──────────────────────
function rule() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "FF9D1A", space: 1 } },
    children: [new TextRun("")],
    spacing: { after: 200 },
  });
}

// ── Helper: two-column table row ────────────────────────────────────────────
function twoColRow(label, value, shade = false) {
  const bg = shade ? LIGHT_BG : WHITE;
  return new TableRow({
    children: [
      new TableCell({
        borders, width: { size: 2800, type: WidthType.DXA },
        shading: { fill: bg, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [bold(label)] })],
      }),
      new TableCell({
        borders, width: { size: 6560, type: WidthType.DXA },
        shading: { fill: bg, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [run(value)] })],
      }),
    ],
  });
}

// ── Helper: header row for tables ──────────────────────────────────────────
function headerRow(cols, widths) {
  return new TableRow({
    tableHeader: true,
    children: cols.map((col, i) =>
      new TableCell({
        borders,
        width: { size: widths[i], type: WidthType.DXA },
        shading: { fill: DARK, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: col, bold: true, color: WHITE, font: "Arial", size: 22 })] })],
      })
    ),
  });
}

// ── Helper: data row (3-column) ─────────────────────────────────────────────
function dataRow3(c1, c2, c3, widths, shade = false) {
  const bg = shade ? LIGHT_BG : WHITE;
  const cell = (text, w) => new TableCell({
    borders, width: { size: w, type: WidthType.DXA },
    shading: { fill: bg, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [run(text)] })],
  });
  return new TableRow({ children: [cell(c1, widths[0]), cell(c2, widths[1]), cell(c3, widths[2])] });
}

// ── Helper: code block (monospaced paragraph) ───────────────────────────────
function codeBlock(lines) {
  return lines.map(line =>
    new Paragraph({
      spacing: { after: 0, line: 240 },
      shading: { fill: "F0F0F0", type: ShadingType.CLEAR },
      indent: { left: 360 },
      children: [new TextRun({ text: line, font: "Courier New", size: 18 })],
    })
  );
}

// ── Diagram: ASCII-art topology rendered as a styled no-border table ────────
function diagramCell(text, bg, color = WHITE, w = 2000) {
  return new TableCell({
    borders: noBorders,
    width: { size: w, type: WidthType.DXA },
    shading: { fill: bg, type: ShadingType.CLEAR },
    margins: { top: 120, bottom: 120, left: 160, right: 160 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, color, font: "Arial", size: 18 })],
    })],
  });
}
function arrowCell(text = "▼", w = 600) {
  return new TableCell({
    borders: noBorders,
    width: { size: w, type: WidthType.DXA },
    shading: { fill: WHITE, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 60, right: 60 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, color: "888888", font: "Arial", size: 22 })],
    })],
  });
}
function emptyCell(w = 600) {
  return new TableCell({
    borders: noBorders,
    width: { size: w, type: WidthType.DXA },
    shading: { fill: WHITE, type: ShadingType.CLEAR },
    children: [new Paragraph({ children: [new TextRun("")] })],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD THE DOCUMENT
// ═══════════════════════════════════════════════════════════════════════════

const doc = new Document({
  // ── List styles ──
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
        ],
      },
    ],
  },

  // ── Styles ──
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: ORANGE },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ORANGE, space: 1 } } },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: DARK },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "444444" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 },
      },
    ],
  },

  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },

      // ── Header ────────────────────────────────────────────────────────────
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ORANGE, space: 1 } },
              spacing: { after: 120 },
              children: [
                new TextRun({ text: "NSBP Radio  |  Technical Documentation", font: "Arial", size: 18, color: "888888" }),
                new TextRun({ text: "\t", font: "Arial", size: 18 }),
                new TextRun({ text: "CONFIDENTIAL", font: "Arial", size: 18, bold: true, color: ORANGE }),
              ],
              tabStops: [{ type: "right", position: 9360 }],
            }),
          ],
        }),
      },

      // ── Footer ────────────────────────────────────────────────────────────
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: ORANGE, space: 1 } },
              spacing: { before: 120 },
              children: [
                new TextRun({ text: "North Shore Bike Park  \u2014  nsbp-radio.vercel.app", font: "Arial", size: 18, color: "888888" }),
                new TextRun({ text: "\tPage ", font: "Arial", size: 18, color: "888888" }),
                new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "888888" }),
              ],
              tabStops: [{ type: "right", position: 9360 }],
            }),
          ],
        }),
      },

      children: [

        // ══════════════════════════════════════════════════════════════════
        // COVER
        // ══════════════════════════════════════════════════════════════════
        new Paragraph({
          spacing: { before: 1440, after: 480 },
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "NSBP RADIO", font: "Arial", size: 72, bold: true, color: ORANGE })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 240 },
          children: [new TextRun({ text: "Technical Documentation", font: "Arial", size: 40, bold: true, color: DARK })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 120 },
          children: [new TextRun({ text: "North Shore Bike Park", font: "Arial", size: 28, color: "444444" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 720 },
          children: [new TextRun({ text: "Version 1.2.0 BETA  \u00B7  2025", font: "Arial", size: 24, color: "888888" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 1440 },
          children: [new TextRun({ text: "nsbp-radio.vercel.app", font: "Arial", size: 22, color: BLUE, underline: {} })],
        }),

        rule(),

        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 160 },
          children: [new TextRun({ text: "Prepared for internal use by North Shore Bike Park staff and developers.", font: "Arial", size: 20, italics: true, color: "666666" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 0 },
          children: [new TextRun({ text: "This document covers architecture, authentication, data flows, component responsibilities,", font: "Arial", size: 20, color: "666666" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 1440 },
          children: [new TextRun({ text: "and operational guidance for the NSBP Radio web application.", font: "Arial", size: 20, color: "666666" })],
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════
        // TABLE OF CONTENTS
        // ══════════════════════════════════════════════════════════════════
        new TableOfContents("Table of Contents", {
          hyperlink: true,
          headingStyleRange: "1-3",
          stylesWithLevels: [],
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════
        // 1. OVERVIEW
        // ══════════════════════════════════════════════════════════════════
        h1("1. Application Overview"),

        p("NSBP Radio is a browser-based music player built specifically for North Shore Bike Park staff. It allows park staff to play curated Spotify playlists through the park's sound system, schedule and broadcast audio announcements stored in Google Drive, and manage playback from any device logged into the park's Google account."),
        blank(),
        p("The application is deployed as a serverless web app on Vercel and is accessible at nsbp-radio.vercel.app. It requires staff to sign in with their North Shore Bike Park Google account and separately authenticate with Spotify."),

        blank(),
        h2("1.1 Key Features"),

        bullet("Spotify playlist selection and playback via the Web Playback SDK"),
        bullet("Hard-block on explicit tracks — automatically skipped silently"),
        bullet("Play count tracking per track (6-hour, today, 3-day, 7-day windows)"),
        bullet("Announcement engine — queue Drive MP3 files to play between or over songs"),
        bullet("Closing Time — hardcoded Semisonic track for end-of-day use"),
        bullet("Microphone mode — drops music to 10% for live PA announcements"),
        bullet("Spotify account management — connect, disconnect, switch accounts"),
        bullet("Google OAuth login with email allowlist (only authorised staff can access)"),
        bullet("Automatic token refresh for both Google and Spotify sessions"),
        bullet("Animated branded UI with NSBP orange colour scheme"),
        blank(),

        // ══════════════════════════════════════════════════════════════════
        // 2. TECH STACK
        // ══════════════════════════════════════════════════════════════════
        new Paragraph({ children: [new PageBreak()] }),
        h1("2. Technology Stack"),

        p("The following table lists every technology in the stack, what layer it belongs to, and its specific responsibility in the application."),
        blank(),

        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [1800, 1600, 5960],
          rows: [
            headerRow(["Technology", "Layer", "Responsibility"], [1800, 1600, 5960]),
            dataRow3("Next.js 15\n(App Router)", "Framework", "Full-stack React framework. Server components render the login page and root layout. Client components handle all interactive UI. API routes serve as secure server-side proxies for Google Drive.", [1800, 1600, 5960], false),
            dataRow3("TypeScript", "Language", "Strongly typed throughout — all store shapes, API responses, component props, and hook return values are typed. Catches integration errors at build time rather than runtime.", [1800, 1600, 5960], true),
            dataRow3("Tailwind CSS v4", "Styling", "Utility-first CSS. Custom brand orange (#FF9D1A) is defined as a CSS variable and used throughout. Animated background uses CSS keyframes defined in globals.css.", [1800, 1600, 5960], false),
            dataRow3("NextAuth.js v5", "Auth (Google)", "Handles the Google OAuth 2.0 flow. Stores access + refresh tokens in encrypted server-side JWTs. Auto-refreshes expired Google tokens. Email allowlist enforced in the signIn callback.", [1800, 1600, 5960], true),
            dataRow3("Spotify Web Playback SDK", "Audio Playback", "Browser-based Spotify player. Registers this browser tab as a Spotify device. Receives real-time playback state events. Controls volume, play, pause, skip, and shuffle.", [1800, 1600, 5960], false),
            dataRow3("Spotify Web API", "Music Data", "REST API for playlist listing, queue management, track metadata (explicit flag, duration, album art), shuffle toggle, and seeking to a position.", [1800, 1600, 5960], true),
            dataRow3("Google Drive API v3", "Announcements", "Lists MP3 files from the hardcoded announcements folder. Supports Shared Drives (requires supportsAllDrives=true). Files are streamed via a server-side proxy route.", [1800, 1600, 5960], false),
            dataRow3("Zustand", "State Management", "Lightweight global state library. Two stores: useSpotifyStore (player, tokens, queue, playerState) and useCommercialStore (files, announcement queue, Closing Time flags).", [1800, 1600, 5960], true),
            dataRow3("Vercel", "Deployment", "Serverless hosting platform. Deploys automatically from the main git branch. Environment variables are stored securely in the Vercel dashboard. Edge CDN serves static assets.", [1800, 1600, 5960], false),
            dataRow3("localStorage", "Persistence", "Play history (7-day rolling window, pruned on write). No Spotify tokens are persisted — those are in-memory only and require re-auth on each page load.", [1800, 1600, 5960], true),
          ],
        }),

        blank(),

        // ══════════════════════════════════════════════════════════════════
        // 3. TOPOLOGY DIAGRAM
        // ══════════════════════════════════════════════════════════════════
        new Paragraph({ children: [new PageBreak()] }),
        h1("3. Architecture Topology"),
        p("The diagram below shows the major systems, how they are hosted, and the data flows between them. All external API calls originate from the browser (client-side) except for the Google Drive file listing and audio proxy, which go through the Next.js server to keep the Google access token off the client."),
        blank(),

        // Row 1 — Browser layer label
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [9360],
          rows: [new TableRow({ children: [
            new TableCell({
              borders: noBorders,
              width: { size: 9360, type: WidthType.DXA },
              shading: { fill: "FFF7ED", type: ShadingType.CLEAR },
              margins: { top: 60, bottom: 60, left: 200, right: 200 },
              children: [new Paragraph({ children: [new TextRun({ text: "BROWSER  (Client — runs in staff member\u2019s browser tab)", bold: true, font: "Arial", size: 18, color: "92400E" })] })],
            }),
          ]})],
        }),

        // Row 2 — Client components side by side
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [4500, 360, 4500],
          rows: [new TableRow({ children: [
            new TableCell({
              borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
              width: { size: 4500, type: WidthType.DXA },
              shading: { fill: "FFF7ED", type: ShadingType.CLEAR },
              margins: { top: 100, bottom: 100, left: 160, right: 160 },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "SpotifyPanel", bold: true, font: "Arial", size: 22, color: DARK })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Playlist selector \u00B7 Now Playing", font: "Arial", size: 18, color: "555555" })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Up Next queue \u00B7 Mic button", font: "Arial", size: 18, color: "555555" })] }),
              ],
            }),
            emptyCell(360),
            new TableCell({
              borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
              width: { size: 4500, type: WidthType.DXA },
              shading: { fill: "FFF7ED", type: ShadingType.CLEAR },
              margins: { top: 100, bottom: 100, left: 160, right: 160 },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "CommercialPanel", bold: true, font: "Arial", size: 22, color: DARK })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Announcements list \u00B7 Queue box", font: "Arial", size: 18, color: "555555" })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Closing Time \u00B7 Settings Modal (Spotify Account, Volume)", font: "Arial", size: 18, color: "555555" })] }),
              ],
            }),
          ]}), new TableRow({ children: [
            new TableCell({
              borders: noBorders, width: { size: 4500, type: WidthType.DXA },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [new TextRun({ text: "\u2195  SDK events / volume calls", font: "Arial", size: 18, color: "888888", italics: true })] })],
            }),
            emptyCell(360),
            new TableCell({
              borders: noBorders, width: { size: 4500, type: WidthType.DXA },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [new TextRun({ text: "\u2193  fetch /api/drive/files  \u2193  audio src", font: "Arial", size: 18, color: "888888", italics: true })] })],
            }),
          ]}),],
        }),

        // Zustand stores row
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [9360],
          rows: [new TableRow({ children: [
            new TableCell({
              borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
              width: { size: 9360, type: WidthType.DXA },
              shading: { fill: "EDE9FE", type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 200, right: 200 },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: "Zustand Stores  ", bold: true, font: "Arial", size: 20, color: PURPLE }),
                new TextRun({ text: "(useSpotifyStore  |  useCommercialStore)", font: "Arial", size: 18, color: "555555" }),
              ]})],
            }),
          ]}),],
        }),

        // Arrows down
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [new TextRun({ text: "\u2193 REST API calls (Bearer token)          \u2193 REST API calls (Bearer token)", font: "Arial", size: 18, color: "888888" })] }),
        blank(),

        // External services row
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2900, 300, 2900, 300, 2960],
          rows: [new TableRow({ children: [
            new TableCell({
              borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
              width: { size: 2900, type: WidthType.DXA },
              shading: { fill: "DCFCE7", type: ShadingType.CLEAR },
              margins: { top: 100, bottom: 100, left: 160, right: 160 },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Spotify Web API", bold: true, font: "Arial", size: 20, color: "166534" })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "api.spotify.com", font: "Arial", size: 18, color: "555555" })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Playlists \u00B7 Queue \u00B7 Track metadata", font: "Arial", size: 16, color: "555555" })] }),
              ],
            }),
            emptyCell(300),
            new TableCell({
              borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
              width: { size: 2900, type: WidthType.DXA },
              shading: { fill: "DCFCE7", type: ShadingType.CLEAR },
              margins: { top: 100, bottom: 100, left: 160, right: 160 },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Spotify SDK", bold: true, font: "Arial", size: 20, color: "166534" })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "sdk.scdn.co", font: "Arial", size: 18, color: "555555" })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "In-browser audio playback", font: "Arial", size: 16, color: "555555" })] }),
              ],
            }),
            emptyCell(300),
            new TableCell({
              borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
              width: { size: 2960, type: WidthType.DXA },
              shading: { fill: "DBEAFE", type: ShadingType.CLEAR },
              margins: { top: 100, bottom: 100, left: 160, right: 160 },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Google OAuth", bold: true, font: "Arial", size: 20, color: "1E3A8A" })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "accounts.google.com", font: "Arial", size: 18, color: "555555" })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Staff login \u00B7 Drive token", font: "Arial", size: 16, color: "555555" })] }),
              ],
            }),
          ]}),],
        }),

        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "                                                               \u2195 server-side proxy", font: "Arial", size: 18, color: "888888", italics: true })] }),
        blank(),

        // Server layer
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [9360],
          rows: [new TableRow({ children: [
            new TableCell({
              borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
              width: { size: 9360, type: WidthType.DXA },
              shading: { fill: "FEF3C7", type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 200, right: 200 },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: "Vercel Edge / Next.js Server  ", bold: true, font: "Arial", size: 20, color: "92400E" }),
                new TextRun({ text: "(/api/drive/files  \u00B7  /api/drive/audio/[fileId]  \u00B7  NextAuth callbacks)", font: "Arial", size: 18, color: "555555" }),
              ]})],
            }),
          ]}),],
        }),

        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [new TextRun({ text: "\u2195 Drive API (Bearer token — kept server-side)", font: "Arial", size: 18, color: "888888", italics: true })] }),
        blank(),

        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [9360],
          rows: [new TableRow({ children: [
            new TableCell({
              borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
              width: { size: 9360, type: WidthType.DXA },
              shading: { fill: "DBEAFE", type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 200, right: 200 },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
                new TextRun({ text: "Google Drive API v3  ", bold: true, font: "Arial", size: 20, color: "1E3A8A" }),
                new TextRun({ text: "(Shared Drive folder \u2014 MP3 announcements files)", font: "Arial", size: 18, color: "555555" }),
              ]})],
            }),
          ]}),],
        }),

        blank(),
        p("Note: Spotify tokens live in the browser (Zustand, in-memory). Google tokens live in encrypted server-side JWTs managed by NextAuth \u2014 the browser never sees the raw Google access token."),

        // ══════════════════════════════════════════════════════════════════
        // 4. AUTHENTICATION
        // ══════════════════════════════════════════════════════════════════
        new Paragraph({ children: [new PageBreak()] }),
        h1("4. Authentication System"),

        p("The app uses two entirely separate authentication systems in parallel. Understanding this dual-auth architecture is critical for any developer working on the app."),

        blank(),
        h2("4.1 Google OAuth (Staff Login)"),

        p("Implemented with NextAuth.js v5 (auth.ts). Staff must sign in with a Google account whose email appears in the ALLOWED_EMAILS environment variable on Vercel. The comparison is case-insensitive to handle Google Workspace capitalisation variations."),
        blank(),
        p("The full OAuth flow:"),
        bullet("Staff visits nsbp-radio.vercel.app and is redirected to /login"),
        bullet("They click Sign in with Google"),
        bullet("Google's consent screen requests openid, email, profile, and drive.readonly scopes"),
        bullet("access_type=offline and prompt=consent are passed to guarantee a refresh_token is returned"),
        bullet("On callback, NextAuth's signIn() checks the email against the allowlist"),
        bullet("If allowed, the access_token, refresh_token, and expires_at are stored in an encrypted HTTP-only JWT cookie"),
        bullet("The session is available server-side via auth() and client-side via useSession()"),
        blank(),
        h3("4.1.1 Token Auto-Refresh"),
        p("Google access tokens expire after 1 hour. The jwt callback in auth.ts checks the expiry timestamp on every request (with a 60-second buffer). If expired, it calls Google's token endpoint with the stored refresh_token and updates the JWT with the new access_token and expiry. If the refresh fails, an error field is set in the JWT and the session layer communicates this to the UI."),

        blank(),
        h2("4.2 Spotify OAuth PKCE (Music Playback)"),
        p("Implemented in lib/spotify-auth.ts using the Proof Key for Code Exchange (PKCE) flow. PKCE is used because the Spotify client secret cannot be exposed in the browser. There is no server-side component to this flow \u2014 all token exchange happens entirely in the browser."),
        blank(),
        p("The full PKCE flow:"),
        bullet("Staff clicks Connect Spotify in the SpotifyPanel (or the Spotify Account section)"),
        bullet("initiateSpotifyAuth() generates a random 128-character code_verifier"),
        bullet("The verifier is SHA-256 hashed and base64url-encoded into a code_challenge"),
        bullet("The verifier is saved in sessionStorage; the browser is redirected to Spotify\u2019s /authorize endpoint"),
        bullet("Staff logs in on Spotify\u2019s page; Spotify redirects to /spotify-callback?code=..."),
        bullet("exchangeCodeForToken() posts the code + verifier to Spotify\u2019s token endpoint"),
        bullet("Spotify returns access_token, refresh_token, and expires_in"),
        bullet("Tokens are stored in the Zustand useSpotifyStore (memory only \u2014 NOT localStorage)"),
        bullet("On page refresh, all Spotify tokens are lost and the staff must Connect Spotify again"),
        blank(),
        h3("4.2.1 Switching Spotify Accounts"),
        p("The Switch button in the Spotify Account section calls initiateSpotifyAuth({ showDialog: true }). The show_dialog=true parameter forces Spotify to always show the account chooser, even if the user is already logged into Spotify in the browser. This allows staff to swap between the NSBP Premium Spotify account and a personal account without signing out of Spotify in the browser first."),

        blank(),
        h2("4.3 Environment Variables"),
        blank(),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [3200, 6160],
          rows: [
            headerRow(["Variable", "Purpose"], [3200, 6160]),
            twoColRow("GOOGLE_CLIENT_ID", "Google Cloud Console OAuth credential client ID", false),
            twoColRow("GOOGLE_CLIENT_SECRET", "Google Cloud Console OAuth credential client secret", true),
            twoColRow("ALLOWED_EMAILS", "Comma-separated list of permitted staff email addresses", false),
            twoColRow("AUTH_SECRET", "Random secret used to sign and encrypt NextAuth JWT cookies", true),
            twoColRow("NEXT_PUBLIC_SPOTIFY_CLIENT_ID", "Spotify Developer Dashboard app client ID (public \u2014 safe in browser)", false),
          ],
        }),

        // ══════════════════════════════════════════════════════════════════
        // 5. GOOGLE DRIVE INTEGRATION
        // ══════════════════════════════════════════════════════════════════
        new Paragraph({ children: [new PageBreak()] }),
        h1("5. Google Drive Integration"),

        p("The announcements feature loads MP3 files from a hardcoded Google Drive folder. The folder ID is compiled into the application source code (commercial-store.ts) and cannot be changed by users. The folder is:"),
        blank(),
        ...codeBlock([
          "Folder URL: https://drive.google.com/drive/folders/1fiQBvHdVwm1EymnH-OAOnGFhtjSA0nED",
          "Folder ID:  1fiQBvHdVwm1EymnH-OAOnGFhtjSA0nED",
        ]),
        blank(),

        h2("5.1 Why Server-Side Proxies?"),
        p("The Google Drive API requires a Bearer token in request headers. Two constraints make client-side Drive calls impossible in this app:"),
        bullet("NextAuth\u2019s client-side session deliberately omits the access_token for security (to prevent exposure in JavaScript). Only server-side code using auth() directly can read it."),
        bullet("The browser\u2019s <audio> element cannot add Authorization headers to its HTTP requests, so Drive\u2019s authenticated download URL cannot be used directly as an audio src."),
        p("Both constraints are solved with Next.js API routes that run on the server."),

        blank(),
        h2("5.2 API Routes"),
        blank(),
        h3("GET /api/drive/files"),
        p("Lists all audio/mpeg files in the hardcoded folder. Called once on CommercialPanel mount and not again unless the page is refreshed. The response is an array of { id, name, mimeType } objects. The route adds supportsAllDrives=true and includeItemsFromAllDrives=true so that Shared Drives (as opposed to My Drive) are accessible."),
        blank(),
        h3("GET /api/drive/audio/[fileId]"),
        p("Proxies the audio file content from Drive to the browser. Forwards the HTTP Range header from the browser\u2019s request to Drive, which allows the <audio> element to seek within the file. Without Range forwarding, seeking would fail because the browser would receive a 200 response (full file) instead of the 206 Partial Content it needs for seek operations."),

        blank(),
        h2("5.3 File Display Names"),
        p("Raw Drive filenames often contain underscores, dashes, and .mp3 extensions. The CommercialPanel strips these on load:"),
        blank(),
        ...codeBlock([
          'displayName = name',
          '  .replace(/\\.mp3$/i, "")     // Remove extension',
          '  .replace(/[_-]/g, " ")       // Underscores/dashes → spaces',
          '  .replace(/\\s+/g, " ")        // Collapse multiple spaces',
          '  .trim()',
        ]),

        blank(),
        h2("5.4 Access Denied Handling"),
        p("If the logged-in Google account does not have read access to the folder, the /api/drive/files route returns HTTP 403. CommercialPanel detects this and displays: \u201CYou do not have the privileges to sign into the Sound Board where Announcements are stored. Talk to Mike about it.\u201D"),

        // ══════════════════════════════════════════════════════════════════
        // 6. SPOTIFY PLAYBACK
        // ══════════════════════════════════════════════════════════════════
        new Paragraph({ children: [new PageBreak()] }),
        h1("6. Spotify Playback System"),

        h2("6.1 Web Playback SDK"),
        p("The Spotify Web Playback SDK (loaded from sdk.scdn.co/spotify-player.js) creates an in-browser Spotify device. This is what makes the browser tab appear as a selectable device in the Spotify app under \u201CConnect to a device.\u201D"),
        blank(),
        p("Initialisation (lib/use-spotify-player.ts):"),
        bullet("The SDK script tag is injected dynamically into <body> once Spotify tokens are available"),
        bullet("window.onSpotifyWebPlaybackSDKReady callback fires when the script has loaded"),
        bullet("new Spotify.Player() is created with name \u201CNSBP Radio\u201D and a getOAuthToken callback"),
        bullet("The getOAuthToken callback is called by the SDK whenever it needs a fresh token. It checks the stored expiry and refreshes if needed before passing the token to the SDK."),
        bullet("player.connect() registers the browser tab as a Spotify device"),
        bullet("The \u201Cready\u201D event fires with a device_id, which is stored in the Zustand store"),
        bullet("transferPlayback() is called immediately to make this tab the active playback device"),
        blank(),

        h2("6.2 Player State"),
        p("The SDK emits player_state_changed events on every playback change. The hook maps the SDK\u2019s raw state object to a simpler PlayerState interface stored in Zustand:"),
        blank(),
        ...codeBlock([
          "interface PlayerState {",
          "  paused: boolean       // Is playback paused?",
          "  shuffle: boolean      // Is shuffle on?",
          "  position: number      // Snapshot position in ms (stale \u2014 not live)",
          "  duration: number      // Track length in ms",
          "  trackName: string     // Current track title",
          "  artistName: string    // Comma-separated artists",
          "  albumArt: string      // Album art URL (i.scdn.co)",
          "  trackUri: string      // spotify:track:... identifier",
          "}",
        ]),
        blank(),
        p("Important: the position field in player_state_changed is a snapshot, not a live counter. For real-time position (e.g., the queue trigger), player.getCurrentState() must be called explicitly."),

        blank(),
        h2("6.3 Playlists"),
        p("Once Spotify tokens are available, SpotifyPanel calls fetchUserPlaylists() which paginates through GET /v1/me/playlists (50 per page) until all playlists are loaded. The selected playlist\u2019s context URI (spotify:playlist:ID) is passed to playPlaylist() which calls PUT /v1/me/player/play with that context so the playlist queue is maintained natively by Spotify."),

        blank(),
        h2("6.4 Up Next Queue"),
        p("lib/use-queue.ts fetches GET /v1/me/player/queue on every track change. The endpoint returns both user-queued tracks and the current playlist context queue. Processing:"),
        bullet("Non-track items (podcasts, ads) are filtered out"),
        bullet("Closing Time is filtered out (it has its own dedicated section)"),
        bullet("Consecutive duplicate URIs are removed (Spotify artifact)"),
        bullet("Each track is mapped to { id, uri, name, artists, explicit, duration, albumArt }"),
        blank(),
        p("Because Spotify\u2019s queue endpoint lags 1\u20133 seconds behind playback context changes, refreshQueue() is called at staggered intervals (500ms, 1500ms, 3000ms) after playlist switches and manual track selections."),

        blank(),
        h2("6.5 Shuffle"),
        p("The shuffle button calls PUT /v1/me/player/shuffle?state=true|false. The current shuffle state is read from playerState.shuffle (updated via player_state_changed events). The button turns orange when shuffle is active."),

        // ══════════════════════════════════════════════════════════════════
        // 7. ANNOUNCEMENT ENGINE
        // ══════════════════════════════════════════════════════════════════
        new Paragraph({ children: [new PageBreak()] }),
        h1("7. Announcement Engine"),
        p("The announcement engine (lib/use-commercial-engine.ts) is the most complex part of the application. It manages fading Spotify in and out, playing a Google Drive audio file, and returning to Spotify \u2014 all with proper sequencing to handle edge cases."),

        blank(),
        h2("7.1 Two Modes"),
        blank(),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [1800, 3780, 3780],
          rows: [
            headerRow(["Mode", "When it triggers", "What happens"], [1800, 3780, 3780]),
            dataRow3("Queue", "Staff clicks Queue on an announcement", "A polling interval checks live position every 500ms. When 1.5 seconds remain in the current track, the fade sequence begins. Music is faded out, announcement plays, then the next Spotify track starts with a fade-in.", [1800, 3780, 3780], false),
            dataRow3("Interrupt", "Staff clicks Play Now on an announcement", "Triggered immediately. The current playback position is captured first (for resuming). Music fades out, announcement plays, then the original track resumes at the captured position with a fade-in.", [1800, 3780, 3780], true),
          ],
        }),

        blank(),
        h2("7.2 Fade Sequence"),
        p("All fades are 1.5 seconds (30 steps \u00D7 50ms delay). The fadeVolume() function uses the Spotify SDK\u2019s player.setVolume() call with a step-by-step loop. The same fade is applied in both queue and interrupt modes for consistency."),

        blank(),
        h2("7.3 Stable Refs Pattern"),
        p("The engine uses React useRef() hooks to keep stable copies of all mutable values (player, tokens, deviceId, queued, pendingTrack). This is critical because the async playAnnouncement callback would otherwise close over stale values from when the effect was first created. The refs are updated synchronously via simple useEffect hooks whenever their source values change."),

        blank(),
        h2("7.4 Pending Track Sequencing"),
        p("If the staff selects a track from the Up Next list while an announcement is already queued, the app needs to play the announcement first and then jump to the selected track (rather than ignoring the announcement or ignoring the track selection). This is handled via the pendingTrack field in the commercial store:"),
        bullet("Staff clicks a track in Up Next while an announcement is queued"),
        bullet("SpotifyPanel stores { trackUri, contextUri } as pendingTrack in the commercial store"),
        bullet("The announcement\u2019s mode is switched to interrupt so it plays immediately"),
        bullet("After the announcement ends, the engine checks pendingTrackRef.current"),
        bullet("If set, it calls PUT /v1/me/player/play with the pending track instead of resuming the original"),
        bullet("clearQueue() clears pendingTrack as part of its reset"),

        blank(),
        h2("7.5 engineBusy Guard"),
        p("The engineBusy ref (a boolean) prevents overlapping announcement plays. If playAnnouncement is called while already running, it returns immediately. The guard is set to true at the start of the function and always cleared in the finally block, even on error."),

        blank(),
        h2("7.6 Progress Bar"),
        p("While an announcement plays, the engine listens to the <audio> element\u2019s timeupdate event and writes { position, duration } (in ms) to the announcementProgress field in the commercial store. CommercialPanel reads this to render a live progress bar. The progress is cleared when the announcement ends."),

        // ══════════════════════════════════════════════════════════════════
        // 8. CLOSING TIME
        // ══════════════════════════════════════════════════════════════════
        new Paragraph({ children: [new PageBreak()] }),
        h1("8. Closing Time Feature"),
        p("Closing Time is a hardcoded end-of-day feature. The Semisonic track \u201CClosing Time\u201D is permanently embedded in the app with its Spotify URI. Staff can queue it or play it immediately from the dedicated section at the bottom of the announcements panel."),
        blank(),
        ...codeBlock([
          "Track ID:  1A5V1sxyCLpKJezp75tUXn",
          "URI:       spotify:track:1A5V1sxyCLpKJezp75tUXn",
          "Spotify URL: https://open.spotify.com/track/1A5V1sxyCLpKJezp75tUXn",
        ]),
        blank(),

        h2("8.1 Queue Button"),
        p("Calls POST /v1/me/player/queue with the Closing Time URI. Spotify\u2019s queue API has no removal endpoint \u2014 once added, the track will play. A closingTimeQueued boolean in the commercial store tracks the UI state. Queuing Closing Time clears any previously queued announcement (and vice versa)."),

        blank(),
        h2("8.2 Play Now Button"),
        p("Fades out current music, adds Closing Time to the Spotify user queue via POST /v1/me/player/queue, immediately skips to it via POST /v1/me/player/next, then fades back in. The skip approach (rather than PUT /play with the URI directly) preserves the playlist context so the original playlist resumes after Closing Time ends."),

        blank(),
        h2("8.3 The Remove Problem"),
        p("Because Spotify provides no API to remove an item from the user queue once added, clicking Remove on a queued Closing Time only updates the UI \u2014 the track will still play when the current one ends. To handle this, the closingTimeRemoved flag is set when Remove is clicked. ClosingTimeSection watches playerState.trackUri and, if Closing Time starts playing while closingTimeRemoved is true, immediately calls POST /v1/me/player/next to skip it, then resets the flag."),

        // ══════════════════════════════════════════════════════════════════
        // 9. SAFETY FEATURES
        // ══════════════════════════════════════════════════════════════════
        new Paragraph({ children: [new PageBreak()] }),
        h1("9. Safety Features"),

        h2("9.1 Explicit Track Filter"),
        p("lib/use-explicit-filter.ts runs at the AppShell level (always active). On every track change, it calls GET /v1/tracks/{id} to check the explicit field. If true, it immediately calls skipToNext(). The lastCheckedUri ref prevents duplicate API calls for the same track."),
        blank(),
        p("Note: The Spotify Web Playback SDK\u2019s player_state_changed payload does not include the explicit flag, which is why a separate REST API call is required."),
        blank(),
        p("Explicit tracks are shown in the Up Next list with a strikethrough and an \u201CE\u201D badge so staff can see what is coming and understand why tracks are being skipped."),

        blank(),
        h2("9.2 Play Count Warnings"),
        p("lib/play-history.ts records every play to localStorage with a Unix timestamp. getPlayCounts(uri) returns counts across four windows:"),
        blank(),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2000, 2000, 5360],
          rows: [
            headerRow(["Window", "Count field", "UI treatment"], [2000, 2000, 5360]),
            dataRow3("Past 6 hours", "sixHours", "If > 2: badge blinks (CSS animation, twice per second)", [2000, 2000, 5360], false),
            dataRow3("Today (since midnight)", "today", "1\u00D7 \u2192 grey, 2\u00D7 \u2192 amber, 3\u00D7+ \u2192 red badge on queue row and play count line", [2000, 2000, 5360], true),
            dataRow3("Past 3 days", "threeDays", "Available in store but not currently displayed in UI", [2000, 2000, 5360], false),
            dataRow3("Past 7 days", "week", "Shown next to today\u2019s count in the now-playing card", [2000, 2000, 5360], true),
          ],
        }),
        blank(),
        p("Records older than 7 days are pruned on every write. \u201CToday\u201D is defined as since midnight in the user\u2019s local timezone, not the past 24 hours, so counts reset cleanly at midnight."),

        blank(),
        h2("9.3 Auto-Skip by Play Count"),
        p("The Settings modal includes a Playback Rules section with a configurable auto-skip threshold. When enabled, any track whose today-play-count meets or exceeds the threshold is treated as overplayed and handled in two ways:"),
        bullet("Dimmed in the Up Next queue in real time — same opacity-40 treatment as explicit and manually skipped tracks, with no Skip/Add button (since the suppression is controlled by the setting, not per-track)"),
        bullet("Automatically skipped during playback via useSkippedFilter, which now checks both manual skips and the auto-skip threshold"),
        blank(),
        p("Settings:"),
        bullet("Enable/disable toggle (checkbox) — defaults to off"),
        bullet("Threshold selector: 1 Time, 2 Times, 3 Times, 4 Times, 5+ Times — defaults to 3"),
        blank(),
        p("Both settings are persisted to localStorage (nsbp_auto_skip_enabled, nsbp_auto_skip_threshold) so they survive page refreshes. The Up Next queue re-renders in real time as the user adjusts the threshold \u2014 tracks cross the threshold and dim/undim immediately without a page reload."),
        blank(),
        p("The threshold 5 means \u201C5 or more times\u201D (the check is counts.today >= threshold). Hovering a dimmed auto-skipped track in the queue shows a tooltip explaining the reason and pointing staff to Settings to adjust the threshold."),

        blank(),
        h2("9.4 Manual Track Skip (Skip / Add)"),
        p("Staff can suppress overplayed tracks without removing them from the Spotify playlist. Each row in the Up Next queue has a Skip button. Pressing it:"),
        bullet("Dims the track to 40% opacity with strikethrough text — identical visual treatment to explicit tracks"),
        bullet("Changes the button label to Add"),
        bullet("Saves the track URI to a localStorage skip list (lib/skipped-tracks.ts)"),
        blank(),
        p("The useSkippedFilter hook (lib/use-skipped-filter.ts) runs at AppShell level alongside useExplicitFilter. On every track change it checks isSkipped(uri). If true, it immediately calls skipToNext() before the track audibly plays — the same auto-skip mechanism used for explicit tracks."),
        blank(),
        p("Pressing Add reverses the action: the track is removed from the skip list, its row returns to normal appearance, and it will play the next time it comes up in the queue."),
        blank(),
        p("Daily reset: the skip list clears automatically at 06:00 AM each day. lib/skipped-tracks.ts stores a last-cleared timestamp alongside the URI list. On page load, getMostRecent6AM() computes the most recent 6AM in the user\u2019s local timezone and compares it to the stored timestamp. If the reset time has passed, the list is wiped and the timestamp updated. Staff do not need to manually restore tracks at the start of a new day."),
        blank(),
        p("Note: The Skip button is only shown on Up Next queue rows (showPlayCount mode). It is not shown on Search results rows, since those tracks are not yet in the queue."),

        blank(),
        h2("9.5 Microphone Mode"),
        p("The microphone button (grey circle with mic icon, next to Play/Pause) allows staff to speak over the music through the park\u2019s PA system. Behaviour:"),
        bullet("Press once: music fades to 10% over 1.5 seconds; button turns red and pulses twice per second"),
        bullet("Press again: music fades back to 100% over 1.5 seconds; button returns to grey"),
        blank(),
        p("Implementation challenge: Spotify\u2019s SDK resets the player volume to 100% internally whenever a new track starts loading. A one-shot useEffect watching trackUri always lost the race against the SDK\u2019s reset. The solution is a polling interval (setInterval at 250ms) that continuously enforces player.setVolume(0.1) while mic mode is active. Any volume spike from a track change is corrected within 250ms \u2014 imperceptible to the listener."),
        blank(),
        p("When staff selects a different track while mic mode is active, the fade-out and fade-in in handlePlayFromQueue respect the current mic state, starting and ending at 0.1 rather than 1.0."),

        // ══════════════════════════════════════════════════════════════════
        // 10. STATE MANAGEMENT
        // ══════════════════════════════════════════════════════════════════
        new Paragraph({ children: [new PageBreak()] }),
        h1("10. State Management"),

        p("The application uses Zustand for global state. There are two stores, each with a distinct responsibility."),
        blank(),
        h2("10.1 useSpotifyStore"),
        blank(),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2400, 1600, 5360],
          rows: [
            headerRow(["Field", "Type", "Description"], [2400, 1600, 5360]),
            dataRow3("tokens", "SpotifyTokens | null", "Spotify OAuth tokens. null = not connected. In-memory only, cleared on page refresh.", [2400, 1600, 5360], false),
            dataRow3("spotifyUser", "SpotifyUser | null", "Display name and email of the connected Spotify account. Fetched from /v1/me once tokens are available.", [2400, 1600, 5360], true),
            dataRow3("player", "Spotify.Player | null", "The Spotify Web Playback SDK player instance. Used for volume control, play, pause, skip.", [2400, 1600, 5360], false),
            dataRow3("deviceId", "string | null", "The SDK device ID. Required for all Spotify REST API calls that target this device.", [2400, 1600, 5360], true),
            dataRow3("playerState", "PlayerState | null", "Snapshot of current track. Updated on every player_state_changed SDK event.", [2400, 1600, 5360], false),
            dataRow3("isReady", "boolean", "True when the SDK device is registered and ready for playback.", [2400, 1600, 5360], true),
            dataRow3("queue", "QueueTrack[]", "Upcoming tracks from /v1/me/player/queue, filtered and mapped.", [2400, 1600, 5360], false),
          ],
        }),

        blank(),
        h2("10.2 useCommercialStore"),
        blank(),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2600, 1600, 5160],
          rows: [
            headerRow(["Field", "Type", "Description"], [2600, 1600, 5160]),
            dataRow3("files", "DriveFile[]", "All MP3 files from the Drive folder. Loaded once on mount.", [2600, 1600, 5160], false),
            dataRow3("status", "idle | queued | playing", "Current announcement engine state.", [2600, 1600, 5160], true),
            dataRow3("queued", "QueuedCommercial | null", "The announcement file and mode (queue/interrupt) waiting to play.", [2600, 1600, 5160], false),
            dataRow3("playingFile", "DriveFile | null", "The file currently playing. Shown in the Now Playing box.", [2600, 1600, 5160], true),
            dataRow3("pendingTrack", "PendingTrack | null", "Spotify track to play after announcement finishes (set when user selects a track while announcement is queued).", [2600, 1600, 5160], false),
            dataRow3("announcementProgress", "{ position, duration } | null", "Live playback position from the <audio> timeupdate event, in ms.", [2600, 1600, 5160], true),
            dataRow3("closingTimeQueued", "boolean", "True when Closing Time has been added to the Spotify user queue.", [2600, 1600, 5160], false),
            dataRow3("closingTimeRemoved", "boolean", "True when Closing Time was queued then removed. Triggers auto-skip when it starts playing.", [2600, 1600, 5160], true),
            dataRow3("announcementGain", "number", "Gain multiplier for announcement audio (0.5\u20132.0). Applied via Web Audio API GainNode to allow amplification above 1.0. Default 1.0. Persisted in localStorage.", [2600, 1600, 5160], false),
            dataRow3("autoSkipEnabled", "boolean", "When true, tracks exceeding autoSkipThreshold today-plays are auto-skipped during playback and dimmed in the queue. Default false. Persisted in localStorage.", [2600, 1600, 5160], true),
            dataRow3("autoSkipThreshold", "number", "Play count threshold for auto-skip (1\u20135; 5 = 5 or more). Only active when autoSkipEnabled is true. Default 3. Persisted in localStorage.", [2600, 1600, 5160], false),
          ],
        }),

        // ══════════════════════════════════════════════════════════════════
        // 11. COMPONENT REFERENCE
        // ══════════════════════════════════════════════════════════════════
        new Paragraph({ children: [new PageBreak()] }),
        h1("11. Component Reference"),

        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2800, 6560],
          rows: [
            headerRow(["Component / File", "Responsibility"], [2800, 6560]),
            twoColRow("app/page.tsx", "Root server component. Checks Google session; redirects to /login if unauthenticated. Renders the header (logo, gear icon) and passes the signOut Server Action as a prop to SettingsModal.", false),
            twoColRow("app/components/AppShell.tsx", "Client layout shell. Mounts useExplicitFilter() and useSkippedFilter(). Renders SpotifyPanel and CommercialPanel side-by-side. Dims SpotifyPanel when an announcement is playing.", true),
            twoColRow("app/components/SpotifyPanel.tsx", "The main left panel. Playlist selector, now-playing card, transport controls (prev/play/next/shuffle/mic), Up Next queue with play counts, explicit badges, and Skip/Add buttons.", false),
            twoColRow("app/components/CommercialPanel.tsx", "The right panel. Lists Drive MP3 files with Queue/Play Now buttons. Shows the Now Playing announcement box with progress bar and Skip button. Closing Time section at the bottom.", true),
            twoColRow("app/components/ClosingTimeSection.tsx", "Hardcoded Closing Time card at the bottom of CommercialPanel. Fetches track metadata from Spotify. Handles Queue, Play Now, and the queued-then-removed auto-skip.", false),
            twoColRow("app/components/SettingsModal.tsx", "Gear icon in the header that opens a modal dialog. Contains: app version, Google account (email + Sign Out), Announcement Volume slider (50\u2013200% via Web Audio API GainNode), Playback Rules (auto-skip threshold), and Spotify Account section.", true),
            twoColRow("app/components/SpotifyAccountSection.tsx", "Shows the connected Spotify account name/email with Disconnect and Switch buttons. Falls back to a Connect Spotify button when not connected. Rendered inside SettingsModal.", false),
            twoColRow("app/components/AnimatedBackground.tsx", "Three drifting radial gradient blobs (warm orange + cool blue-white) plus fine horizontal contour lines. All CSS keyframe animations. Fixed position behind all content.", false),
            twoColRow("lib/use-spotify-player.ts", "Hook that loads the Spotify SDK, initialises the Player instance, and wires all SDK event listeners. Handles token refresh inside getOAuthToken.", true),
            twoColRow("lib/use-queue.ts", "Fetches the Spotify queue on track changes. Filters, maps, and deduplicates. Exposes refreshQueue() for on-demand refetches.", false),
            twoColRow("lib/use-commercial-engine.ts", "The announcement engine. Manages the full fade-out/play/fade-in sequence for both queue and interrupt modes. Routes audio through a Web Audio API GainNode to apply announcementGain. Handles pending track sequencing.", true),
            twoColRow("lib/use-explicit-filter.ts", "Watches every track change. Calls /v1/tracks/{id} to check explicit flag. Auto-skips if true.", false),
            twoColRow("lib/use-skipped-filter.ts", "Watches every track change. Checks (1) isSkipped(uri) for manual skips and (2) today play count against autoSkipThreshold if autoSkipEnabled. Calls skipToNext() for either condition.", true),
            twoColRow("lib/skipped-tracks.ts", "localStorage-backed skip list. Stores track URIs that staff have manually suppressed. Resets automatically at 06:00 AM daily. Exports skipTrack(), unskipTrack(), isSkipped(), getSkippedUris().", false),
            twoColRow("lib/use-play-history.ts", "Records each track play to localStorage via recordPlay(). Guards against duplicate records for the same URI.", true),
            twoColRow("lib/play-history.ts", "Pure localStorage read/write functions for play history. Prunes records > 7 days on write. Returns counts across four time windows.", false),
            twoColRow("lib/spotify-store.ts", "Zustand store for all Spotify state: tokens, player, deviceId, playerState, queue, spotifyUser.", true),
            twoColRow("lib/commercial-store.ts", "Zustand store for all announcement state: files, status, queued, pendingTrack, progress, closingTime flags, announcementGain (persisted to localStorage).", false),
            twoColRow("lib/spotify-auth.ts", "PKCE OAuth helpers: initiateSpotifyAuth(), exchangeCodeForToken(), refreshAccessToken(), clearSpotifyTokens().", true),
            twoColRow("lib/spotify-api.ts", "Thin wrappers around Spotify REST API endpoints: playlists, play, transfer, skip, seek.", false),
            twoColRow("lib/drive-api.ts", "Drive types and helpers. getDriveAudioProxyUrl() is used in production. fetchDriveFiles() is a legacy reference.", true),
            twoColRow("auth.ts", "NextAuth configuration: Google provider, drive.readonly scope, email allowlist, JWT token storage, auto-refresh.", false),
            twoColRow("app/api/drive/files/route.ts", "Server-side route: lists Drive MP3 files using auth() token. Supports Shared Drives.", true),
            twoColRow("app/api/drive/audio/[fileId]/route.ts", "Server-side audio proxy: streams Drive file to browser with Range header forwarding.", false),
            twoColRow("app/spotify-callback/page.tsx", "OAuth callback page. Reads the ?code= param and calls exchangeCodeForToken(). Redirects to / on completion.", true),
          ],
        }),

        // ══════════════════════════════════════════════════════════════════
        // 12. DEPLOYMENT
        // ══════════════════════════════════════════════════════════════════
        new Paragraph({ children: [new PageBreak()] }),
        h1("12. Deployment & Operations"),

        h2("12.1 Vercel Deployment"),
        p("The application is deployed on Vercel\u2019s free tier. Deployments are triggered by running vercel --prod from the local development machine. There is no CI/CD pipeline \u2014 deployments are always manual."),
        blank(),
        p("The production URL is: https://nsbp-radio.vercel.app"),
        p("The project is under the Vercel account mike-3677s-projects."),

        blank(),
        h2("12.2 Adding a New Staff Member"),
        p("To grant a new staff member access:"),
        bullet("Add their Google email to the ALLOWED_EMAILS environment variable in the Vercel dashboard (comma-separated)"),
        bullet("Add their Google account as a test user in the Google Cloud Console OAuth consent screen (if the app is still in Testing mode)"),
        bullet("Add their Spotify account email in the Spotify Developer Dashboard under the app\u2019s User Management (if the app is still in Development mode and has fewer than 25 users)"),
        bullet("No code changes or redeployment required for the email allowlist \u2014 the env var is read at runtime"),
        blank(),
        p("Note: If the Spotify app is promoted to Extended Quota Mode, the 25-user Development limit no longer applies and the Spotify Developer Dashboard step is no longer needed."),

        blank(),
        h2("12.3 Adding a New Announcement"),
        p("Upload an MP3 file to the Google Drive folder at the hardcoded folder ID. The app will pick it up automatically on the next page refresh \u2014 no code changes required. File naming convention: use underscores or spaces; the display name is auto-cleaned."),

        blank(),
        h2("12.4 Changing the Announcements Folder"),
        p("The folder ID is hardcoded in lib/commercial-store.ts as the ANNOUNCEMENTS_FOLDER_ID constant. To change it, update the constant and redeploy."),

        blank(),
        h2("12.5 Git Repository"),
        p("The project is maintained in a git repository at ~/AI/nsbp-radio, synced to GitHub (Visigothi/nsbp-radio). Vercel deploys automatically on every push to main. Version tags follow the pattern vX.Y.Z BETA."),
        blank(),
        ...codeBlock([
          "v1.0 BETA  \u2014 Initial release: full Spotify + Drive + auth stack",
          "v1.1.1 BETA \u2014 Mic button, queue fixes, Spotify account section, background animation",
          "v1.1.2 BETA \u2014 Comprehensive code comments throughout all source files",
          "v1.2.0 BETA \u2014 Settings modal (gear icon), announcement volume slider (Web Audio API),",
          "              Spotify account section moved into settings, version in modal",
          "v1.2.1 BETA \u2014 Skip/Add toggle on Up Next queue rows: dims skipped tracks, auto-skips",
          "              at playback time via useSkippedFilter, resets at 06:00 AM daily",
          "v1.4.1 BETA \u2014 Auto-skip by play count: Settings > Playback Rules toggle + threshold",
          "              selector (1\u20135+ times today); real-time queue dimming; useSkippedFilter",
          "              now handles both manual skip and play-count threshold checks",
          "v1.5.0 BETA \u2014 Spotify search: search bar in Spotify panel, play/queue from results",
          "v1.6.0 BETA \u2014 Admin layer: separate admin panel at /admin with Google OAuth,",
          "              signed JWT session cookie, track analytics (Supabase), settings shortcut",
          "v1.6.1 BETA \u2014 Announcement analytics, admin invite system (admin_users table),",
          "              admin dashboard tab UI (Track Analytics / Admin Access)",
        ]),

        // ══════════════════════════════════════════════════════════════════
        // 13. ADMIN PANEL
        // ══════════════════════════════════════════════════════════════════
        new Paragraph({ children: [new PageBreak()] }),
        h1("13. Admin Panel"),
        p("The admin panel at /admin is a separate authenticated dashboard for park operators. It uses its own session layer (independent of the staff NextAuth session) and connects to Supabase to store and retrieve analytics data."),

        blank(),
        h2("13.1 Admin Auth Flow"),
        p("Admin authentication is independent of the staff Google OAuth session. The two layers use different cookies and do not interfere with each other."),
        blank(),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [600, 8760],
          rows: [
            headerRow(["Step", "Description"], [600, 8760]),
            twoColRow("1", "Admin visits /admin/login and clicks Sign in with Google", false),
            twoColRow("2", "NextAuth completes Google OAuth (admin email is allowed even without being in ALLOWED_EMAILS)", true),
            twoColRow("3", "/api/admin/verify checks the email against ADMIN_EMAIL env var and the admin_users Supabase table — either match grants access", false),
            twoColRow("4", "On success, a signed 1-hour admin_session JWT cookie is minted using the AUTH_SECRET key (jose library)", true),
            twoColRow("5", "Middleware (proxy.ts) verifies the cookie on every /admin/* request; expired or missing cookie redirects to /admin/login", false),
          ],
        }),

        blank(),
        h2("13.2 Admin Access Management"),
        p("The Admin Access tab in the dashboard lets the owner invite other Google accounts to the admin panel without Vercel or env var access."),
        blank(),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2800, 6560],
          rows: [
            headerRow(["Concept", "Details"], [2800, 6560]),
            twoColRow("Owner", "Always granted access via ADMIN_EMAIL env var. Shown at the top of the list with an Owner badge. Not stored in admin_users.", false),
            twoColRow("Invited admins", "Stored in the admin_users Supabase table (email, invited_by, created_at). Take effect on the invitee's next login — no email sent.", true),
            twoColRow("Invite form", "Server Action in page.tsx reads the caller's admin_session JWT to record invited_by, then inserts the new row.", false),
            twoColRow("Duplicate handling", "Postgres unique constraint on email (error code 23505) is silently ignored — inviting an existing admin is a no-op.", true),
          ],
        }),

        blank(),
        h2("13.3 Track Analytics"),
        p("All playback events are written to the track_plays Supabase table. The admin dashboard shows today's plays in Vancouver time, aggregated by track, sorted chronologically by first play."),
        blank(),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2000, 1600, 5760],
          rows: [
            headerRow(["Column", "Type", "Notes"], [2000, 1600, 5760]),
            dataRow3("track_id", "text", "Spotify track ID or Google Drive file ID", [2000, 1600, 5760], false),
            dataRow3("track_name", "text", "Display name shown to staff", [2000, 1600, 5760], true),
            dataRow3("artist_name", "text", "Spotify artist(s); empty string for announcements", [2000, 1600, 5760], false),
            dataRow3("play_type", "text", "'track' (default) or 'announcement'", [2000, 1600, 5760], true),
            dataRow3("played_at", "timestamptz", "UTC timestamp of playback start", [2000, 1600, 5760], false),
            dataRow3("environment", "text", "'dev' or 'prod' — separates local and production plays", [2000, 1600, 5760], true),
            dataRow3("instance_id", "text", "e.g. 'nsbp' — separates different park deployments", [2000, 1600, 5760], false),
          ],
        }),
        blank(),
        p("Tracks are recorded after 5 seconds of playback (same threshold as localStorage play history). Announcements are recorded immediately when playback begins. Both appear in the same table and the same dashboard list — announcements are highlighted in orange with an 'Announcement' badge."),

        blank(),
        h2("13.4 Dashboard UI"),
        p("The dashboard uses a two-tab layout. All data is fetched server-side in page.tsx and passed as props to AdminTabs (a client component), so tab switching is instant."),
        blank(),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2400, 6960],
          rows: [
            headerRow(["Tab", "Contents"], [2400, 6960]),
            twoColRow("Track Analytics", "Stat cards (Tracks, Announcements, Total Plays, Most Played) + chronological play table with orange announcement rows + Refresh button", false),
            twoColRow("Admin Access", "Admin users list (owner + invited rows) + invite form", true),
          ],
        }),

        blank(),
        h2("13.5 Multi-Instance Isolation"),
        p("Currently all park deployments share one Supabase project. The environment and instance_id columns on track_plays prevent data from mixing. The planned production solution is one Supabase project per park (each with its own SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars), at which point these columns can be removed."),

        // ══════════════════════════════════════════════════════════════════
        // 14. KNOWN LIMITATIONS (was 13)
        // ══════════════════════════════════════════════════════════════════
        new Paragraph({ children: [new PageBreak()] }),
        h1("14. Known Limitations & Future Considerations"),

        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [3000, 6360],
          rows: [
            headerRow(["Limitation", "Notes"], [3000, 6360]),
            twoColRow("Spotify tokens not persisted", "Spotify tokens are in-memory only. Refreshing the page requires clicking Connect Spotify again. Could be fixed by persisting tokens to localStorage (with appropriate security considerations).", false),
            twoColRow("Spotify queue item cannot be removed", "Once a track is added to the Spotify user queue via POST /v1/me/player/queue, Spotify provides no API to remove it. The app works around this with the closingTimeRemoved auto-skip flag.", true),
            twoColRow("Play history is per-browser", "Play counts stored in localStorage are not shared across devices or browsers. Staff using different computers will see different counts.", false),
            twoColRow("Spotify Development mode limit", "The Spotify app is limited to 25 users in Development mode. Adding more users requires applying for Extended Quota Mode in the Spotify Developer Dashboard.", true),
            twoColRow("Google OAuth in Testing mode", "If the Google Cloud app is in Testing mode, new users must be added manually in the Google Cloud Console. Apply for production verification to remove this limit.", false),
            twoColRow("Explicit check latency", "The explicit check requires a REST API call to /v1/tracks/{id} on every new track. This adds ~100\u2013300ms latency before a skip can happen, during which the explicit track briefly plays.", true),
            twoColRow("No cross-device sync", "The app is designed for single-device use per session. Playing from two browser tabs simultaneously would cause conflicts.", false),
          ],
        }),

        blank(),
        h2("14.1 Potential Enhancements"),
        bullet("Persist Spotify tokens to localStorage for seamless page refreshes"),
        bullet("Add a play history screen showing recent track history with timestamps"),
        bullet("Scheduled announcements \u2014 trigger an announcement at a specific time"),
        bullet("Multiple announcement queue slots"),
        bullet("Display BPM / energy from Spotify\u2019s audio features endpoint"),
        bullet("Staff user access control \u2014 manage ALLOWED_EMAILS from the admin panel (currently env-var only)"),
        bullet("Historical analytics \u2014 7-day and monthly play history views"),
        bullet("Banned tracks \u2014 block specific Spotify tracks from playing"),
        bullet("Remote playback control from the admin panel (play, pause, skip, volume)"),
        bullet("Multi-park architecture \u2014 one Supabase project per park instead of shared instance"),

        // ══════════════════════════════════════════════════════════════════
        // 15. QUICK REFERENCE (was 14)
        // ══════════════════════════════════════════════════════════════════
        new Paragraph({ children: [new PageBreak()] }),
        h1("15. Quick Reference"),

        h2("15.1 Key URLs"),
        blank(),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [3000, 6360],
          rows: [
            headerRow(["Resource", "URL"], [3000, 6360]),
            twoColRow("Production app", "https://nsbp-radio.vercel.app", false),
            twoColRow("Admin panel", "https://nsbp-radio.vercel.app/admin", true),
            twoColRow("Vercel dashboard", "https://vercel.com/mike-3677s-projects/nsbp-radio", false),
            twoColRow("Google Cloud Console", "https://console.cloud.google.com", true),
            twoColRow("Spotify Developer Dashboard", "https://developer.spotify.com/dashboard", false),
            twoColRow("Supabase project", "https://supabase.com/dashboard/project/frbqjdmpdashtgropoip", true),
            twoColRow("Announcements folder", "https://drive.google.com/drive/folders/1fiQBvHdVwm1EymnH-OAOnGFhtjSA0nED", false),
            twoColRow("Closing Time on Spotify", "https://open.spotify.com/track/1A5V1sxyCLpKJezp75tUXn", true),
          ],
        }),

        blank(),
        h2("15.2 Authorised Staff Emails"),
        bullet("reception@northshorebikepark.ca"),
        bullet("mike@northshorebikepark.ca"),
        bullet("josh@northshorebikepark.ca"),
        bullet("mike@westcoastbikeparks.ca"),

        blank(),
        h2("15.3 Brand Colours"),
        blank(),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2400, 2400, 4560],
          rows: [
            headerRow(["Name", "Hex", "Usage"], [2400, 2400, 4560]),
            dataRow3("Brand Orange", "#FF9D1A", "Primary accent: headings, active states, borders, badges, mic button active", [2400, 2400, 4560], false),
            dataRow3("Background", "#000000", "App background (pure black)", [2400, 2400, 4560], true),
            dataRow3("Surface", "#27272A (zinc-800)", "Card and panel backgrounds", [2400, 2400, 4560], false),
            dataRow3("Text Primary", "#FFFFFF", "Main text on dark background", [2400, 2400, 4560], true),
            dataRow3("Text Secondary", "#A1A1AA (zinc-400)", "Secondary labels, timestamps", [2400, 2400, 4560], false),
            dataRow3("Warning Amber", "#FBBF24", "2\u00D7 play count badge", [2400, 2400, 4560], true),
            dataRow3("Danger Red", "#F87171", "3\u00D7+ play count badge, mic active", [2400, 2400, 4560], false),
          ],
        }),

        blank(),
        rule(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
          children: [new TextRun({ text: "End of Document  \u00B7  NSBP Radio v1.6.1 BETA  \u00B7  North Shore Bike Park  \u00B7  2026", font: "Arial", size: 18, color: "888888", italics: true })],
        }),
      ],
    },
  ],
});

// Write file
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("/Users/mike/AI/nsbp-radio/Documentation/NSBP-Radio-Technical-Documentation.docx", buffer);
  console.log("Done: NSBP-Radio-Technical-Documentation.docx");
});
