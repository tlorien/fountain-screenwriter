# Fountain Screenwriter for Obsidian

An Obsidian screenwriting plugin powered by [FountainJS]([https://github.com/thombruce/FountainJS), featuring real-time **syntax highlighting**, classic virtual **page formatting**, dynamic **indentation**, status-bar **line-type read-outs**, **hover tooltips**, and seamless **desktop & mobile support**.

<img src="images/desktop-1.png" alt="Desktop screenshot" style="max-width: 100%; height: auto; max-height: 600px;" />

---

## 🔥 Features

 **Fountain Support**  
Full support for [Fountain](https://fountain.io/) markup: scene headings, action, character, dialogue, parentheticals, transitions, lyrics, and more.

**Real-time Fountain syntax highlighting**
Instantly see Scene Headings, Action, Character Cues, Dialogue, Parentheticals, Transitions, Lyrics, Notes, and more in distinct colors.

**Customizable colour themes**
Choose from built-in palettes or define your own accent colors for every script element.

**True “virtual page” formatting**
Your script adopts the classic 78-character page width, centered in the editor—just like Final Draft or Fade In.

**Dynamic indentation toggle**
Switch between flush-left and screenplay-style margins on the fly. One click in the settings keeps you in “classic” or “modern” mode.

**Status-bar line-type read-out**
Always know which element you’re on—Scene Heading, Dialogue, Action, etc.—at a glance, in the bottom bar.

**Hover tooltips**
Hover over any line to see its type spelled out (e.g. DIALOGUE, CHARACTER), perfect for catching mis-tagged lines.

**Typewriter Mode**
Keep the line you’re working on locked in the center of the view for that old-school typewriter feel.

**Responsive mobile support**
Portrait or landscape, your pages reflow gracefully on every screen, so you can always write on the go.

<img src="images/mobile-landscape.png" alt="Mobile screenshot in landscape" style="max-width: 350px%; max-height: 600px;" />

<img src="images/mobile-portrait.png" alt="Mobile screenshot in portrait" style="max-width: 300px; max-height: 600px;" />

---

## 🚀 Installation
Open Obsidian’s `Settings` → `Community plugins` → `Browse`

Search for “Fountain Screenwriter” and click `Install`.


## 🎨 Configuration
Head to `Settings` → `Fountain Screenwriter` to tailor your experience:

- **Show Hover Hints**: Toggle the line-type tooltip.

- **Syntax Colours**: Turn colour-coding on or off.

- **Indentation**: Enable classic screenplay margins or flush-left.

- **Colour Overrides**: Pick your own color for Scene Headings, Dialogue, Transitions, and more.

- **Typewriter Mode**: Keep the line you’re working on locked in the center of the view for that old-school typewriter feel.

## 📖 Usage
In any note, add YAML frontmatter:

```yaml
---
script: true
---
```

Start typing in Fountain syntax:

```fountain
INT. KITCHEN – DAY

MARY
(excited)
I can’t believe it’s finally happening!

Mary watches as her text instantly adopts screenplay styling in Obsidian—no extra commands needed.
```

## ❤️ Credits & Support
Built with ❤️ and admiration using `@thombruce/fountain-js` and Obsidian’s plugin API.

Find support, report issues, or contribute here on GitHub.

## 📜 License
Distributed under the GPL-3.0 license. See LICENSE for details.
