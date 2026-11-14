// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// TEST (lab) build only: runs as soon as the page starts (main.ts, `--mode lab`). Loads the test
// styles (lab.css + the Apple-like theme in apple.css), marks the page and puts the General / Expert
// switch and the "test" label in the top bar. The official build never includes this file.

import "./lab.css";
import "./apple.css";
import "./applecom.css";
import "./appledark.css";
import "./labclean.css";
import { onLang } from "../i18n";
import { installAudienceInTopbar } from "./audience";
import { lt } from "./strings";

document.documentElement.classList.add("lab");
installAudienceInTopbar();

const badge = document.createElement("span");
badge.className = "lab-badge";
document.querySelector(".topbar .brand")?.after(badge);
const paint = () => {
  badge.textContent = lt("badge");
};
paint();
onLang(paint);
