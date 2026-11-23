package com.bruce.tv;

import org.json.JSONObject;

/** Un thème = toutes les options de l'interface. Chaque thème prédéfini peut être modifié et garde ses réglages. */
public class Theme {

    // ---------------- palettes proposées à la télécommande
    public static final int[] COLORS = {0xFFFFFFFF, 0xFFC9CDD4, 0xFF0A84FF, 0xFF2BF3FF, 0xFFA05CFF, 0xFFFF3C78,
            0xFFFF453A, 0xFFFF9F0A, 0xFFE8B86A, 0xFF30D158, 0xFF63E6BE, 0xFF14161A};
    public static final String[] COLOR_NAMES = {"Blanc", "Gris perle", "Bleu", "Cyan", "Violet", "Rose",
            "Rouge", "Orange", "Doré", "Vert", "Menthe", "Noir"};
    public static final int[] BASES = {0xFF050505, 0xFF121216, 0xFF07041A, 0xFF0A1A33, 0xFF2A0F2E, 0xFF2A1D14,
            0xFF101418, 0xFF3A1020, 0xFFE6EAF0, 0xFFF5EFE6};
    public static final String[] BASE_NAMES = {"Noir", "Anthracite", "Nuit", "Marine", "Prune", "Bois",
            "Ardoise", "Bordeaux", "Clair", "Crème"};
    public static final int[] GLOWS = {0xFFFFFFFF, 0xFFB4C8FF, 0xFFA03CFF, 0xFF00C8FF, 0xFFFF3C78, 0xFFFF7A3D,
            0xFFE8B86A, 0xFF30D158, 0xFF6A2BD6, 0xFF8A5A34, 0xFF000000};
    public static final String[] GLOW_NAMES = {"Blanc", "Bleu glacier", "Violet", "Cyan", "Rose", "Orange",
            "Doré", "Vert", "Indigo", "Caramel", "Aucune"};

    public static final String[] PRESET_IDS = {"glass", "cinema", "carrousel", "neon", "salon", "clair", "sunset", "lisible", "marine"};

    public String id, name;
    public int accent = 0, text = 0;               // index dans COLORS
    public int base = 0, glow1 = 0, glow2 = 1;     // index BASES / GLOWS
    public int wallStyle = 0;                      // 0 rubans · 1 halos · 2 dégradé · 3 uni · 4 mon image
    public String wallImage = "";                  // image choisie sur la clé (content://…)
    public int wallDim = 35;                       // assombrir l'image 0..80 %
    public int glassLight = 0;                     // 0 verre sombre · 1 verre clair
    public int glassOpacity = 40;                  // 10..90
    public int blur = 3;                           // 1..5
    public int radius = 22;                        // 8..40 dp
    public int dockSize = 1;                       // 0 petit · 1 normal · 2 grand
    public int dockPos = 0;                        // 0 bas · 1 haut
    public int iconMono = 0;                       // 0 couleurs · 1 noir et blanc
    public int textScale = 100;                    // 80..150 %
    public int clockStyle = 0;                     // 0 fin · 1 gras · 2 masqué
    public boolean h24 = true, showDate = true, showHero = true, showBanner = true;
    public int anim = 1;                           // 0 rapide · 1 normal · 2 aucune
    public int zoom = 125;                         // 100..150 %
    public int clockPos = 0;                       // 0 gauche · 1 centre · 2 droite
    public int layout = 0;                         // 0 barre en bas (dock) · 1 grandes affiches · 2 carrousel 3D
    public int greeting = 0;                       // 0 Bonsoir · 1 Bonsoir Papa · 2 Bonsoir Bruce · 3 Bonsoir la famille · 4 aucun

    public static final String[] GREETINGS = {"", " Papa", " Bruce", " la famille", null};

    public static Theme preset(String id) {
        Theme t = new Theme();
        t.id = id;
        switch (id) {
            case "neon":
                t.name = "Néon nuit"; t.accent = 3; t.base = 2; t.glow1 = 2; t.glow2 = 3; t.wallStyle = 1; t.glassOpacity = 35; break;
            case "salon":
                t.name = "Salon chaleureux"; t.accent = 8; t.base = 5; t.glow1 = 6; t.glow2 = 9; t.wallStyle = 2; t.radius = 18; t.glassOpacity = 45; break;
            case "clair":
                t.name = "Clair"; t.accent = 2; t.text = 11; t.base = 8; t.glow1 = 0; t.glow2 = 1; t.wallStyle = 1; t.glassLight = 1; t.glassOpacity = 60; t.radius = 26; break;
            case "sunset":
                t.name = "Coucher de soleil"; t.accent = 0; t.base = 7; t.glow1 = 5; t.glow2 = 8; t.wallStyle = 2; t.glassLight = 1; t.glassOpacity = 22; t.radius = 28; break;
            case "lisible":
                t.name = "Grand et lisible"; t.accent = 7; t.base = 6; t.glow1 = 10; t.glow2 = 10; t.wallStyle = 3; t.dockSize = 2; t.textScale = 130; t.zoom = 115; t.radius = 18; t.showBanner = false; t.glassOpacity = 55; break;
            case "cinema":
                t.name = "Cinéma"; t.layout = 1; t.wallStyle = 1; t.glow2 = 0; t.radius = 18; t.zoom = 112; t.glassOpacity = 45; break;
            case "carrousel":
                t.name = "Carrousel 3D"; t.layout = 2; t.clockPos = 1; t.wallStyle = 1; t.glow2 = 10; t.radius = 22; t.glassOpacity = 45; break;
            case "marine":
                t.name = "Marine"; t.accent = 1; t.base = 3; t.glow1 = 1; t.glow2 = 3; t.wallStyle = 0; t.glassOpacity = 38; break;
            default:
                t.id = "glass"; t.name = "Liquid Glass";
        }
        return t;
    }

    public int accentColor() { return COLORS[accent]; }
    public int textColor() { return COLORS[text]; }
    public int dim(int alpha) { return (textColor() & 0x00FFFFFF) | (alpha << 24); }
    public float animFactor() { return anim == 0 ? 0.65f : anim == 1 ? 1f : 0f; }
    public float ts() { return textScale / 100f; }
    public int dockTile() { return dockSize == 0 ? 54 : dockSize == 1 ? 66 : 84; }

    /** clé qui change seulement si le fond doit être recalculé */
    public String wallKey() { return base + "/" + glow1 + "/" + glow2 + "/" + wallStyle + "/" + blur + "/" + wallImage + "/" + wallDim; }

    public JSONObject toJson() {
        JSONObject o = new JSONObject();
        try {
            o.put("id", id); o.put("name", name); o.put("accent", accent); o.put("text", text); o.put("base", base);
            o.put("glow1", glow1); o.put("glow2", glow2); o.put("wallStyle", wallStyle); o.put("glassLight", glassLight);
            o.put("glassOpacity", glassOpacity); o.put("blur", blur); o.put("radius", radius); o.put("dockSize", dockSize);
            o.put("dockPos", dockPos); o.put("iconMono", iconMono); o.put("textScale", textScale); o.put("clockStyle", clockStyle);
            o.put("h24", h24); o.put("showDate", showDate); o.put("showHero", showHero); o.put("showBanner", showBanner);
            o.put("anim", anim); o.put("zoom", zoom); o.put("greeting", greeting);
            o.put("wallImage", wallImage); o.put("wallDim", wallDim); o.put("layout", layout); o.put("clockPos", clockPos);
        } catch (Exception ignored) {}
        return o;
    }

    private static int clampI(JSONObject o, String k, int def, int min, int max) {
        int v = o.optInt(k, def);
        return v < min ? min : Math.min(v, max);
    }

    /** relit un thème sauvegardé, en vérifiant chaque valeur (un fichier abîmé ne fait jamais planter) */
    public static Theme fromJson(String id, String json) {
        Theme t = preset(id);
        if (json == null) return t;
        try {
            JSONObject o = new JSONObject(json);
            t.accent = clampI(o, "accent", t.accent, 0, COLORS.length - 1);
            t.text = clampI(o, "text", t.text, 0, COLORS.length - 1);
            t.base = clampI(o, "base", t.base, 0, BASES.length - 1);
            t.glow1 = clampI(o, "glow1", t.glow1, 0, GLOWS.length - 1);
            t.glow2 = clampI(o, "glow2", t.glow2, 0, GLOWS.length - 1);
            t.wallStyle = clampI(o, "wallStyle", t.wallStyle, 0, 4);
            t.glassLight = clampI(o, "glassLight", t.glassLight, 0, 1);
            t.glassOpacity = clampI(o, "glassOpacity", t.glassOpacity, 10, 90);
            t.blur = clampI(o, "blur", t.blur, 1, 5);
            t.radius = clampI(o, "radius", t.radius, 8, 40);
            t.dockSize = clampI(o, "dockSize", t.dockSize, 0, 2);
            t.dockPos = clampI(o, "dockPos", t.dockPos, 0, 1);
            t.iconMono = clampI(o, "iconMono", t.iconMono, 0, 1);
            t.textScale = clampI(o, "textScale", t.textScale, 80, 150);
            t.clockStyle = clampI(o, "clockStyle", t.clockStyle, 0, 2);
            t.anim = clampI(o, "anim", t.anim, 0, 2);
            t.zoom = clampI(o, "zoom", t.zoom, 100, 150);
            t.greeting = clampI(o, "greeting", t.greeting, 0, GREETINGS.length - 1);
            t.wallDim = clampI(o, "wallDim", t.wallDim, 0, 80);
            t.layout = clampI(o, "layout", t.layout, 0, 2);
            t.clockPos = clampI(o, "clockPos", t.clockPos, 0, 2);
            String wi = o.optString("wallImage", "");
            t.wallImage = wi.startsWith("content://media/") ? wi : "";
            t.h24 = o.optBoolean("h24", t.h24);
            t.showDate = o.optBoolean("showDate", t.showDate);
            t.showHero = o.optBoolean("showHero", t.showHero);
            t.showBanner = o.optBoolean("showBanner", t.showBanner);
        } catch (Exception ignored) {}
        return t;
    }

    public static String presetName(String id) { return preset(id).name; }
}
