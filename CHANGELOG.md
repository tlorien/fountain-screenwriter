# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- New features that are added but not yet released.

### Changed
- Changes in existing functionality that are not breaking.

### Deprecated
- Features that are still available but will be removed in the future.

### Removed
- Features that have been removed in this release.

### Fixed
- Bug fixes.

### Security
- Vulnerability fixes.

---

## Typewriter Scrolling [v1.1.1] - 2026-06-29

### Changed
- QoL fix for typewriter mode to prevent text from being selected when moving the caret:
    - We pull in Transaction from @codemirror/state.
    - We inspect each transaction’s userEvent annotation.
    - If the event is select.pointer (a click) or select.drag (a click-and-drag), we skip the recenter.
    - Otherwise (arrow keys, typing, programmatic moves), we call centerOnView() as before.

---

## Typewriter Scrolling [v1.1.0] - 2026-06-29

### Added
- Togglable `Typewriter Scrolling` effect.

### Notes
- Released as v1.0.0 to prevent issues with Obsidian plugin review.

---

## Initial Release [v1.0.0] - 2025-06-28

### ✨ Features
#### 📱 Mobile-Friendly Layout
Mobile phones are supported!

#### 🎬 Fountain Syntax Highlighting
Instant, in-editor formatting for scene headings, action, characters, dialogue, parentheticals, transitions, lyrics, and more!

#### 📐 Classic 78-Character Page
Your script **looks** and **feels** like a real screenplay—center-justified for desktop and landscape-mode editing.

#### ➡️ Automated Indentation
Switch between automated screenplay margins or a flush-left style on a per-script basis.

#### 🎨 Custom Colour Themes
Customize the Fountain syntax coloring to your liking.

#### 🗒️ Status-Bar Line Indicator
See “ACTION,” “DIALOGUE,” “CHARACTER,” etc., at a glance in Obsidian’s bottom-right status bar—colourized text keeps you in flow without tripping over syntax.

#### 💡 Hover Tooltips
Hover the mouse cursor (or tap-hold on mobile) to reveal the current line type label.