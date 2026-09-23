#!/usr/bin/env python3
"""
Convierte un .ttf al formato "typeface.json" que espera el FontLoader de
three.js, incluyendo solo los caracteres que se usan.

three.js ya no distribuye fuentes en su paquete npm, y los conversores online
son cajas negras. Esto genera el fichero de forma reproducible y solo con los
glifos necesarios, así que pesa unos pocos KB en vez de cientos.

Formato de los comandos de contorno (ver FontLoader.js de three):
    m  x y                       moveTo
    l  x y                       lineTo
    q  finX finY  ctrlX ctrlY    quadraticCurveTo  (¡el final va primero!)
    b  finX finY  c1X c1Y c2X c2Y  bezierCurveTo

Las fuentes variables se fijan antes de extraer contornos: si no, se usa la
instancia por defecto, que en Gluten es peso 100 y saldrían letras finísimas.

Uso:
    uv run --with fonttools scripts/font-to-typeface.py ENTRADA.ttf SALIDA.json "TEXTO" [eje=valor ...]

Ejemplo:
    ... Gluten.ttf hero-gluten.json "PAKO PORTALO" wght=900
"""

from __future__ import annotations

import json
import sys
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont


def fmt(value: float) -> str:
    """Redondea a entero cuando puede: el JSON queda mucho más corto."""
    rounded = round(value, 1)
    return str(int(rounded)) if rounded == int(rounded) else str(rounded)


class TypefacePen(BasePen):
    """Traduce los contornos del glifo a la cadena de comandos de three."""

    def __init__(self, glyph_set):
        super().__init__(glyph_set)
        self.commands: list[str] = []

    def _moveTo(self, pt):
        self.commands.append(f"m {fmt(pt[0])} {fmt(pt[1])}")

    def _lineTo(self, pt):
        self.commands.append(f"l {fmt(pt[0])} {fmt(pt[1])}")

    def _curveToOne(self, c1, c2, pt):
        self.commands.append(
            f"b {fmt(pt[0])} {fmt(pt[1])} "
            f"{fmt(c1[0])} {fmt(c1[1])} {fmt(c2[0])} {fmt(c2[1])}"
        )

    def _qCurveToOne(self, ctrl, pt):
        self.commands.append(
            f"q {fmt(pt[0])} {fmt(pt[1])} {fmt(ctrl[0])} {fmt(ctrl[1])}"
        )

    def _closePath(self):
        pass


def convert(ttf_path: str, out_path: str, text: str, axes: dict[str, float]) -> None:
    font = TTFont(ttf_path)

    if "fvar" in font:
        from fontTools.varLib import instancer

        available = {a.axisTag for a in font["fvar"].axes}
        # Cualquier eje que no se indique se fija en su máximo: para los pesos
        # es lo que queremos, y evita quedarnos con la instancia por defecto.
        pins = {
            a.axisTag: axes.get(a.axisTag, a.maxValue) for a in font["fvar"].axes
        }
        unknown = set(axes) - available
        if unknown:
            raise SystemExit(f"Ejes inexistentes en la fuente: {sorted(unknown)}")
        font = instancer.instantiateVariableFont(font, pins, inplace=False)
        print(f"  fuente variable fijada en {pins}")

    cmap = font.getBestCmap()
    glyph_set = font.getGlyphSet()
    hmtx = font["hmtx"]
    head = font["head"]
    hhea = font["hhea"]
    units = head.unitsPerEm

    glyphs: dict[str, dict] = {}
    missing: list[str] = []

    for char in sorted(set(text)):
        code = ord(char)
        name = cmap.get(code)
        if name is None:
            missing.append(char)
            continue

        pen = TypefacePen(glyph_set)
        glyph_set[name].draw(pen)
        advance, _ = hmtx[name]

        entry: dict[str, object] = {"ha": advance, "o": " ".join(pen.commands)}

        # El espacio no tiene contorno, así que tampoco tiene caja.
        if pen.commands:
            bounds = font["glyf"][name] if "glyf" in font else None
            if bounds is not None and bounds.numberOfContours != 0:
                entry["x_min"] = bounds.xMin
                entry["x_max"] = bounds.xMax

        glyphs[char] = entry

    if missing:
        raise SystemExit(f"Faltan glifos en la fuente: {missing!r}")

    names = {record.nameID: str(record) for record in font["name"].names}

    data = {
        "glyphs": glyphs,
        "familyName": names.get(1, "Unknown"),
        "ascender": hhea.ascent,
        "descender": hhea.descent,
        "underlinePosition": font["post"].underlinePosition,
        "underlineThickness": font["post"].underlineThickness,
        "boundingBox": {
            "yMin": head.yMin,
            "xMin": head.xMin,
            "yMax": head.yMax,
            "xMax": head.xMax,
        },
        "resolution": units,
        "original_font_information": {
            "full_font_name": names.get(4, ""),
            "license": names.get(13, ""),
        },
    }

    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))

    print(f"{out_path}: {len(glyphs)} glifos, {units} upem")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)

    pinned: dict[str, float] = {}
    for argument in sys.argv[4:]:
        tag, _, value = argument.partition("=")
        pinned[tag] = float(value)

    convert(sys.argv[1], sys.argv[2], sys.argv[3], pinned)
