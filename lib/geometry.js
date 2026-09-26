"use strict";

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function workspaceSize(workspace) {
  const rect = workspace.getBoundingClientRect();
  return {
    width: Math.max(0, Math.round(rect.width || workspace.clientWidth)),
    height: Math.max(0, Math.round(rect.height || workspace.clientHeight))
  };
}

function clampGeometry(geometry, workspace_size, limits = {}) {
  const min_width = Math.min(finiteNumber(limits.min_width, 240), workspace_size.width);
  const min_height = Math.min(finiteNumber(limits.min_height, 160), workspace_size.height);
  const width = Math.max(min_width, Math.min(finiteNumber(geometry.width, min_width), workspace_size.width));
  const height = Math.max(min_height, Math.min(finiteNumber(geometry.height, min_height), workspace_size.height));
  return {
    left: Math.max(0, Math.min(finiteNumber(geometry.left, 0), Math.max(0, workspace_size.width - width))),
    top: Math.max(0, Math.min(finiteNumber(geometry.top, 0), Math.max(0, workspace_size.height - height))),
    width,
    height
  };
}

module.exports = { clampGeometry, finiteNumber, workspaceSize };
