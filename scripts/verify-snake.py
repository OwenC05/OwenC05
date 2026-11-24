"""Check the pinned snk renderer against GitHub's signed-out calendar before publishing."""

from datetime import date
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET


class PublicCalendar(HTMLParser):
    def __init__(self):
        super().__init__()
        self.cells = {}
        self.dates = []
        self.heading = ""
        self.in_heading = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "h2" and attrs.get("id") == "js-contribution-activity-description":
            self.in_heading = True
        if tag == "td" and "data-date" in attrs:
            day = date.fromisoformat(attrs["data-date"])
            weekday = (day.weekday() + 1) % 7  # GitHub uses Sunday as row zero.
            position = (int(attrs["data-ix"]), weekday)
            level = int(attrs["data-level"])
            if position in self.cells or level not in range(5):
                raise ValueError(f"Invalid public calendar cell for {day}")
            self.cells[position] = level
            self.dates.append(day)

    def handle_endtag(self, tag):
        if tag == "h2":
            self.in_heading = False

    def handle_data(self, data):
        if self.in_heading:
            self.heading += data


def checked_svg(path, calendar, caption):
    svg = path.read_text(encoding="utf-8")
    root = ET.fromstring(svg)
    css = root.findtext("{*}style") or ""
    levels = dict(re.findall(r"\.c\.(\w+)\{fill:var\(--c([1-4])\)", css))
    cells = {}
    for rect in root.findall("{*}rect"):
        classes = rect.get("class", "").split()
        if "c" not in classes:
            continue
        # The pinned renderer uses a 16px grid with a 2px inset.
        x, y = (int(rect.attrib[key]) - 2 for key in ("x", "y"))
        position = (x // 16, y // 16)
        if x % 16 or y % 16 or position in cells:
            raise ValueError(f"{path}: invalid snake grid position {x}, {y}")
        cells[position] = 0 if classes == ["c"] else int(levels[classes[1]])
    if cells != calendar.cells:
        raise ValueError(f"{path}: snake cells differ from the public contribution calendar")

    # The pinned SVG reserves 32px above the grid. Keep the label clear of the snake.
    width = int(root.attrib["width"])
    color = "#59636e" if "light" in path.stem else "#9da7b3"
    label = (f'<text id="calendar-summary" x="{width - 32}" y="-20" text-anchor="end" '
             f'font-family="system-ui,sans-serif" font-size="14" fill="{color}">{caption}</text>')
    # Show the complete calendar before the snake starts. Reduced-motion viewers keep it.
    motion = ('<style id="calendar-motion">.c,.s,.u{animation-delay:2s}'
              '@media(prefers-reduced-motion:reduce){.c{animation:none!important}'
              '.s,.u{display:none}}</style>')
    svg = re.sub(r'<text id="calendar-summary"[^>]*>[^<]*</text>', '', svg)
    svg = re.sub(r'<style id="calendar-motion">[^<]*</style>', '', svg)
    return svg.replace("</svg>", f"{motion}{label}</svg>")


if __name__ == "__main__":
    calendar = PublicCalendar()
    calendar.feed(sys.stdin.read())
    calendar.close()
    heading = re.fullmatch(r"\s*([\d,]+)\s+(contributions?)\s+in the last year\s*", calendar.heading)
    if not heading or not calendar.cells:
        raise ValueError("Missing public contribution calendar or annual total")
    caption = f"{heading[1]} {heading[2]} in the last year · through {max(calendar.dates):%d %b %Y}"
    output = {path: checked_svg(path, calendar, caption)
              for path in (Path("assets/snake-light.svg"), Path("assets/snake-dark.svg"))}
    for path, svg in output.items():
        path.write_text(svg, encoding="utf-8")
    print(f"Both snakes match all {len(calendar.cells)} public calendar cells. {caption}")
