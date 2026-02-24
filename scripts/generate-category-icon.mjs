#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginImgsDir = path.resolve(__dirname, "../com.crest.simplestats.sdPlugin/imgs/plugin");
const actionsImgsDir = path.resolve(__dirname, "../com.crest.simplestats.sdPlugin/imgs/actions");

// Ensure output directories exist
if (!fs.existsSync(pluginImgsDir)) {
  fs.mkdirSync(pluginImgsDir, { recursive: true });
}
if (!fs.existsSync(actionsImgsDir)) {
  fs.mkdirSync(actionsImgsDir, { recursive: true });
}

/**
 * Generate a Windows 11 Task Manager-inspired category icon
 * Creates a 56×56px PNG icon with overlaid line graphs in a rounded rectangle
 * Uses colors from SimpleStats metric groups
 */

// SVG template for the icon
const generateSvg = () => {
  const size = 56;
  const padding = 3;
  const innerSize = size - padding * 2;
  const borderRadius = 6;
  const graphPadding = 4;

  // Graph area dimensions
  const graphLeft = padding + graphPadding;
  const graphRight = size - padding - graphPadding;
  const graphTop = padding + graphPadding;
  const graphBottom = size - padding - graphPadding;
  const graphWidth = graphRight - graphLeft;
  const graphHeight = graphBottom - graphTop;

  // Stacked area chart specifications
  // Each layer represents relative heights that will be stacked
  const layers = [
    {
      color: "#27D4FF", // CPU cyan (base layer ~35%)
      heights: [0.28, 0.42, 0.22, 0.38, 0.35, 0.48, 0.3, 0.45, 0.32, 0.46],
      lineOpacity: 0.95
    },
    {
      color: "#C8A0FF", // GPU purple (~25%)
      heights: [0.2, 0.3, 0.22, 0.28, 0.26, 0.2, 0.27, 0.18, 0.28, 0.22],
      lineOpacity: 1.0
    },
    {
      color: "#4CFF8A", // Disk green (~20%)
      heights: [0.28, 0.08, 0.30, 0.10, 0.26, 0.12, 0.28, 0.14, 0.20, 0.24],
      lineOpacity: 0.95
    }
  ];

  // Build stacked area chart with dimmed fills + bright lines
  let fillMarkup = "";
  let lineMarkup = "";
  let baselineHeights = new Array(10).fill(0); // Start with baseline at 0

  for (const layer of layers) {
    const heights = layer.heights;
    const pointCount = heights.length;

    // Calculate actual Y positions for this layer (baseline + layer height)
    const layerPoints = [];
    let totalHeight = 0;

    for (let i = 0; i < pointCount; i++) {
      const x = graphLeft + (i / (pointCount - 1)) * graphWidth;
      totalHeight = baselineHeights[i] + heights[i];
      const y = graphBottom - (totalHeight * graphHeight);
      layerPoints.push({ x, y });
    }

    // Create filled area polygon (dimmed fill like actual keys)
    let polygonPath = "";
    for (let i = 0; i < layerPoints.length; i++) {
      const point = layerPoints[i];
      polygonPath += i === 0 ? `M${point.x.toFixed(1)} ${point.y.toFixed(1)}` : ` L${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    }

    // Close the polygon by going back along the baseline
    for (let i = layerPoints.length - 1; i >= 0; i--) {
      const x = layerPoints[i].x;
      const y = graphBottom - (baselineHeights[i] * graphHeight);
      polygonPath += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    polygonPath += " Z";

    // Add dimmed fill
    fillMarkup += `
    <path
      d="${polygonPath}"
      fill="${layer.color}"
      opacity="0.15"
    />`;

    // Create bright line on top (like the stroke in actual keys)
    let linePath = "";
    for (let i = 0; i < layerPoints.length; i++) {
      const point = layerPoints[i];
      linePath += i === 0 ? `M${point.x.toFixed(1)} ${point.y.toFixed(1)}` : ` L${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    }

    lineMarkup += `
    <path
      d="${linePath}"
      fill="none"
      stroke="${layer.color}"
      stroke-width="1"
      stroke-linecap="round"
      stroke-linejoin="round"
      opacity="${layer.lineOpacity}"
    />`;

    // Update baseline for next layer
    for (let i = 0; i < pointCount; i++) {
      baselineHeights[i] += heights[i];
    }
  }

  const linesMarkup = fillMarkup + lineMarkup;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- Background rounded rectangle -->
  <rect
    x="${padding}"
    y="${padding}"
    width="${innerSize}"
    height="${innerSize}"
    fill="#1E1E1E"
    rx="${borderRadius}"
    ry="${borderRadius}"
  />

  <!-- Border -->
  <rect
    x="${padding}"
    y="${padding}"
    width="${innerSize}"
    height="${innerSize}"
    fill="none"
    stroke="#3A3A3A"
    stroke-width="1"
    rx="${borderRadius}"
    ry="${borderRadius}"
  />

  <!-- Line graphs -->
  ${linesMarkup}
</svg>`;
};

// Device colors matching GROUP_STYLE in metric action
const DEVICE_COLORS = {
  cpu: "#27D4FF",
  gpu: "#A06CFF",
  memory: "#2A6DFF",
  disk: "#4CFF8A",
  network: "#FF6FB1",
  system: "#FFD166"
};

/**
 * Generate a single-line action icon with a specific color
 * Minimal design with one bright line and dimmed fill
 * Used in the Stream Deck actions list
 */
const generateActionSvg = (color = "#27D4FF") => {
  const size = 56;
  const padding = 3;
  const innerSize = size - padding * 2;
  const borderRadius = 6;
  const graphPadding = 5;

  // Graph area dimensions
  const graphLeft = padding + graphPadding;
  const graphRight = size - padding - graphPadding;
  const graphTop = padding + graphPadding;
  const graphBottom = size - padding - graphPadding;
  const graphWidth = graphRight - graphLeft;
  const graphHeight = graphBottom - graphTop;

  // Raw data - more dramatic peaks and valleys for visibility at small scale
  const rawHeights = [0.18, 0.72, 0.12, 0.88, 0.2, 0.62, 0.08, 0.8];

  // Apply lighter moving average smoothing (reduced from metric.ts for more definition)
  const smoothed = rawHeights.length > 4
    ? rawHeights.map((value, index) => {
        if (index < 2 || index > rawHeights.length - 3) return value;
        return (rawHeights[index - 2] + rawHeights[index - 1] + 1.5 * value + rawHeights[index + 1] + rawHeights[index + 2]) / 6;
      })
    : rawHeights;

  // Calculate points
  const step = smoothed.length > 1 ? graphWidth / (smoothed.length - 1) : 0;
  const points = smoothed.map((value, index) => {
    const x = graphLeft + step * index;
    const y = graphBottom - (value * graphHeight);
    return { x, y };
  });

  // Generate quadratic bezier curves with midpoint control points (same as metric.ts)
  const fmt = (num) => num.toFixed(1);
  let linePath = "";
  if (points.length > 0) {
    linePath = `M${fmt(points[0].x)} ${fmt(points[0].y)}`;
    if (points.length === 2) {
      linePath += ` L${fmt(points[1].x)} ${fmt(points[1].y)}`;
    } else if (points.length > 2) {
      for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const curr = points[i];
        const midX = (prev.x + curr.x) / 2;
        const midY = (prev.y + curr.y) / 2;
        linePath += ` Q${fmt(prev.x)} ${fmt(prev.y)} ${fmt(midX)} ${fmt(midY)}`;
      }
      const last = points[points.length - 1];
      linePath += ` T${fmt(last.x)} ${fmt(last.y)}`;
    }
  }

  // Create fill area
  const last = points[points.length - 1];
  const first = points[0];
  const fillPath = linePath
    ? `${linePath} L${fmt(last.x)} ${graphBottom} L${fmt(first.x)} ${graphBottom} Z`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- Background rounded rectangle -->
  <rect
    x="${padding}"
    y="${padding}"
    width="${innerSize}"
    height="${innerSize}"
    fill="#1E1E1E"
    rx="${borderRadius}"
    ry="${borderRadius}"
  />

  <!-- Border -->
  <rect
    x="${padding}"
    y="${padding}"
    width="${innerSize}"
    height="${innerSize}"
    fill="none"
    stroke="#3A3A3A"
    stroke-width="1"
    rx="${borderRadius}"
    ry="${borderRadius}"
  />

  <!-- Dimmed fill -->
  <path
    d="${fillPath}"
    fill="${color}"
    opacity="0.15"
  />

  <!-- Bright line -->
  <path
    d="${linePath}"
    fill="none"
    stroke="${color}"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="1"
  />
</svg>`;
};

/**
 * Convert SVG to PNG using available tools
 * Tries multiple approaches: sharp, canvas, or falls back to SVG only
 */
async function svgToPng(svgString, outputPath) {
  try {
    // Try using sharp library
    const sharp = await import("sharp");
    const buffer = Buffer.from(svgString);
    await sharp.default(buffer)
      .png()
      .toFile(outputPath);
    console.log(`✓ Created PNG: ${outputPath}`);
    return true;
  } catch {
    console.warn("⚠ Sharp not available, trying alternative method...");

    try {
      // Try using node-canvas
      const { createCanvas } = await import("canvas");
      // Parse SVG dimensions from viewBox
      const viewBoxMatch = svgString.match(/viewBox="0 0 (\d+) (\d+)"/);
      if (!viewBoxMatch) throw new Error("Could not parse SVG viewBox");

      const [, width, height] = viewBoxMatch.map(Number);
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      // For now, render a simple fallback
      ctx.fillStyle = "#1E1E1E";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "#3A3A3A";
      ctx.lineWidth = 1;
      ctx.roundRect(2, 2, width - 4, height - 4, 6);
      ctx.stroke();

      // Draw bars with gradient
      const gradient = ctx.createLinearGradient(0, height - 10, 0, 10);
      gradient.addColorStop(0, "#27D4FF");
      gradient.addColorStop(1, "#8FE7FF");
      ctx.fillStyle = gradient;

      const barSpacing = 2;
      const barCount = 4;
      const barWidth = (width - 4 - (barCount - 1) * barSpacing) / barCount;
      const heights = [0.6, 0.8, 0.45, 0.7];

      for (let i = 0; i < barCount; i++) {
        const x = 2 + i * (barWidth + barSpacing);
        const h = (height - 4) * 0.7 * heights[i];
        const y = height - 2 - h;
        ctx.fillRect(x, y, barWidth, h);
      }

      const buffer = canvas.toBuffer("image/png");
      fs.writeFileSync(outputPath, buffer);
      console.log(`✓ Created PNG with canvas: ${outputPath}`);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Generate a large test version (400x400) for visual inspection
 */
const generateLargeTestIcon = () => {
  const size = 400;
  const padding = 20;
  const innerSize = size - padding * 2;
  const borderRadius = 12;
  const graphPadding = 30;

  // Graph area dimensions
  const graphLeft = padding + graphPadding;
  const graphRight = size - padding - graphPadding;
  const graphTop = padding + graphPadding;
  const graphBottom = size - padding - graphPadding;
  const graphWidth = graphRight - graphLeft;
  const graphHeight = graphBottom - graphTop;

  const rawHeights = [0.18, 0.72, 0.12, 0.88, 0.2, 0.62, 0.08, 0.8];

  // Apply lighter moving average smoothing (reduced from metric.ts for more definition)
  const smoothed = rawHeights.length > 4
    ? rawHeights.map((value, index) => {
        if (index < 2 || index > rawHeights.length - 3) return value;
        return (rawHeights[index - 2] + rawHeights[index - 1] + 1.5 * value + rawHeights[index + 1] + rawHeights[index + 2]) / 6;
      })
    : rawHeights;

  // Calculate points
  const step = smoothed.length > 1 ? graphWidth / (smoothed.length - 1) : 0;
  const linePoints = smoothed.map((value, index) => {
    const x = graphLeft + step * index;
    const y = graphBottom - (value * graphHeight);
    return { x, y };
  });

  // Generate quadratic bezier curves with midpoint control points (same as metric.ts)
  const fmt = (num) => num.toFixed(1);
  let linePath = "";
  if (linePoints.length > 0) {
    linePath = `M${fmt(linePoints[0].x)} ${fmt(linePoints[0].y)}`;
    if (linePoints.length === 2) {
      linePath += ` L${fmt(linePoints[1].x)} ${fmt(linePoints[1].y)}`;
    } else if (linePoints.length > 2) {
      for (let i = 1; i < linePoints.length; i += 1) {
        const prev = linePoints[i - 1];
        const curr = linePoints[i];
        const midX = (prev.x + curr.x) / 2;
        const midY = (prev.y + curr.y) / 2;
        linePath += ` Q${fmt(prev.x)} ${fmt(prev.y)} ${fmt(midX)} ${fmt(midY)}`;
      }
      const last = linePoints[linePoints.length - 1];
      linePath += ` T${fmt(last.x)} ${fmt(last.y)}`;
    }
  }

  // Create fill path from line path
  const first = linePoints[0];
  const last = linePoints[linePoints.length - 1];
  const fillPath = linePath
    ? `${linePath} L${fmt(last.x)} ${graphBottom} L${fmt(first.x)} ${graphBottom} Z`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${padding}" y="${padding}" width="${innerSize}" height="${innerSize}" fill="#1E1E1E" rx="${borderRadius}" ry="${borderRadius}" />
  <rect x="${padding}" y="${padding}" width="${innerSize}" height="${innerSize}" fill="none" stroke="#3A3A3A" stroke-width="2" rx="${borderRadius}" ry="${borderRadius}" />

  <!-- Dimmed fill -->
  <path d="${fillPath}" fill="#27D4FF" opacity="0.15" />

  <!-- Bright smooth line -->
  <path d="${linePath}" fill="none" stroke="#27D4FF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="1" />
</svg>`;
};

/**
 * Main execution
 */
async function main() {
  try {
    // Generate category icon
    const categorySvg = generateSvg();
    const categoryPngPath = path.join(pluginImgsDir, "category.png");
    const categorySvgPath = path.join(pluginImgsDir, "category.svg");

    fs.writeFileSync(categorySvgPath, categorySvg);
    console.log(`✓ Created SVG: ${categorySvgPath}`);

    const categoryPngCreated = await svgToPng(categorySvg, categoryPngPath);

    if (!categoryPngCreated) {
      console.log("\n⚠ PNG conversion failed. SVG is available as fallback.");
      console.log("To convert SVG to PNG, you can:");
      console.log("1. Install sharp: npm install --save-dev sharp");
      console.log("2. Install canvas: npm install --save-dev canvas");
      console.log("3. Use an online converter or image editor");
      console.log(`4. Run this script again after installing dependencies`);
      process.exit(1);
    }

    console.log(`✓ Created PNG: ${categoryPngPath}`);

    // Generate per-device action icons
    for (const [device, color] of Object.entries(DEVICE_COLORS)) {
      const actionSvg = generateActionSvg(color);
      const actionPngPath = path.join(actionsImgsDir, `${device}.png`);
      const actionSvgPath = path.join(actionsImgsDir, `${device}.svg`);

      fs.writeFileSync(actionSvgPath, actionSvg);
      console.log(`✓ Created SVG: ${actionSvgPath}`);

      const actionPngCreated = await svgToPng(actionSvg, actionPngPath);

      if (!actionPngCreated) {
        console.log(`\n⚠ Action icon PNG conversion failed for ${device}. SVG is available as fallback.`);
        process.exit(1);
      }

      console.log(`✓ Created PNG: ${actionPngPath}`);
    }

    console.log("\n✓ All icons generated successfully!");
    console.log("  Category: " + categoryPngPath);
    console.log("  Actions:  " + Object.keys(DEVICE_COLORS).join(", "));

    // Generate large test version for visual inspection
    const testSvg = generateLargeTestIcon();
    const testSvgPath = path.join(__dirname, "../test-icon-large.svg");
    const testPngPath = path.join(__dirname, "../test-icon-large.png");

    fs.writeFileSync(testSvgPath, testSvg);
    console.log("\n✓ Created test SVG: " + testSvgPath);

    const testPngCreated = await svgToPng(testSvg, testPngPath);
    if (testPngCreated) {
      console.log("✓ Created test PNG: " + testPngPath);
    } else {
      console.log("⚠ Test PNG conversion failed");
    }

  } catch (err) {
    console.error("Error generating icons:", err);
    process.exit(1);
  }
}

main();
