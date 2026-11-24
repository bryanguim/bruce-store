package com.bruce.tv;

import android.content.Context;
import android.graphics.BitmapFactory;
import android.net.Uri;
import java.io.InputStream;
import android.graphics.Bitmap;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.widget.FrameLayout;

/**
 * Liquid Glass léger : le fond flouté est calculé UNE seule fois (petite image),
 * puis chaque panneau en verre redessine juste la portion qui est derrière lui.
 * Aucun flou en temps réel → fluide même sur une petite clé TV.
 */
public class Glass {

    public static Bitmap wall, blurred;

    // ------------------------------------------------------------ génération du fond
    /** lit l'image choisie, réduite à la taille utile (pas de gaspillage de mémoire) */
    static Bitmap loadImage(Context ctx, String uri, int w, int h) {
        if (!Theme.validImage(uri)) return null;
        try {
            if (uri.startsWith("file:") || uri.startsWith("app:")) {
                String path = uri.startsWith("app:") ? new java.io.File(ctx.getFilesDir(), PhotoReceiver.FILE).getAbsolutePath() : uri.substring(5);
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(path, o);
                if (o.outWidth <= 0 || o.outHeight <= 0) return null;
                int sample = 1;
                while (o.outWidth / (sample * 2) >= w && o.outHeight / (sample * 2) >= h) sample *= 2;
                BitmapFactory.Options o2 = new BitmapFactory.Options();
                o2.inSampleSize = sample;
                return BitmapFactory.decodeFile(path, o2);
            }
            Uri u = Uri.parse(uri);
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            try (InputStream in = ctx.getContentResolver().openInputStream(u)) { BitmapFactory.decodeStream(in, null, o); }
            if (o.outWidth <= 0 || o.outHeight <= 0) return null;
            int sample = 1;
            while (o.outWidth / (sample * 2) >= w && o.outHeight / (sample * 2) >= h) sample *= 2;
            BitmapFactory.Options o2 = new BitmapFactory.Options();
            o2.inSampleSize = sample;
            try (InputStream in = ctx.getContentResolver().openInputStream(u)) { return BitmapFactory.decodeStream(in, null, o2); }
        } catch (Throwable e) { return null; }
    }

    public static void build(Context ctx, Theme t, int screenW, int screenH) {
        int w = Math.max(320, screenW / 2), h = Math.max(180, screenH / 2);
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        if (t.wallStyle == 4) {
            Bitmap img = loadImage(ctx, t.wallImage, w, h);
            if (img != null) {
                float s = Math.max(w / (float) img.getWidth(), h / (float) img.getHeight());
                float dw = img.getWidth() * s, dh = img.getHeight() * s;
                c.drawBitmap(img, null, new RectF((w - dw) / 2f, (h - dh) / 2f, (w + dw) / 2f, (h + dh) / 2f), new Paint(Paint.FILTER_BITMAP_FLAG));
                img.recycle();
                // voile sombre en dégradé : le texte reste lisible même sur une image claire
                Paint v = new Paint();
                float d = t.wallDim / 100f;
                v.setShader(new LinearGradient(0, 0, 0, h, new int[]{withA(0, Math.min(1f, d + 0.15f)), withA(0, d * 0.6f), withA(0, Math.min(1f, d + 0.2f))}, null, Shader.TileMode.CLAMP));
                c.drawRect(0, 0, w, h, v);
                finish(b, t, w, h);
                return;
            }
        }
        int base = Theme.BASES[t.base], g1 = Theme.GLOWS[t.glow1], g2 = Theme.GLOWS[t.glow2];
        boolean none1 = t.glow1 == Theme.GLOWS.length - 1, none2 = t.glow2 == Theme.GLOWS.length - 1;
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        if (t.wallStyle == 2) {
            p.setShader(new LinearGradient(0, 0, w, h, new int[]{none1 ? base : mix(base, g1, 0.55f), base, none2 ? base : mix(base, g2, 0.35f)}, null, Shader.TileMode.CLAMP));
            c.drawRect(0, 0, w, h, p);
            p.setShader(null);
        } else {
            c.drawColor(base);
        }
        if (t.wallStyle != 3) {
            if (!none1) halo(c, p, w * 0.18f, h * 0.12f, w * 0.62f, withA(g1, 0.30f));
            if (!none2) halo(c, p, w * 0.86f, h * 0.92f, w * 0.7f, withA(g2, 0.22f));
            if (!none1) halo(c, p, w * 0.62f, h * 0.25f, w * 0.3f, withA(g1, 0.12f));
        }
        if (t.wallStyle == 0 && !none1) {
            // rubans « liquides »
            Paint s = new Paint(Paint.ANTI_ALIAS_FLAG);
            s.setStyle(Paint.Style.STROKE);
            s.setStrokeCap(Paint.Cap.ROUND);
            s.setMaskFilter(new BlurMaskFilter(w * 0.004f + 1, BlurMaskFilter.Blur.NORMAL));
            for (int k = 0; k < 5; k++) {
                float y0 = h * (0.70f - k * 0.028f);
                s.setStrokeWidth(w * (0.062f - k * 0.010f));
                s.setShader(new LinearGradient(0, y0, w, y0 - h * 0.2f,
                        new int[]{withA(g1, 0), withA(g1, 0.10f + k * 0.03f), withA(g1, 0.34f - k * 0.05f), withA(g1, 0.08f), withA(g1, 0)},
                        new float[]{0, 0.35f, 0.5f, 0.65f, 1}, Shader.TileMode.CLAMP));
                Path path = new Path();
                path.moveTo(-w * 0.05f, y0);
                path.cubicTo(w * 0.26f, h * (0.39f - k * 0.04f), w * 0.57f, h * (0.97f - k * 0.02f), w * 1.07f, h * (0.48f + k * 0.023f));
                c.drawPath(path, s);
            }
        }
        finish(b, t, w, h);
    }

    private static void finish(Bitmap b, Theme t, int w, int h) {
        wall = b;
        // flou : on réduit beaucoup puis on lisse (très rapide, fait une seule fois)
        int div = 10 + t.blur * 4;
        Bitmap small = Bitmap.createScaledBitmap(b, Math.max(8, w / div), Math.max(8, h / div), true);
        boxBlur(small, 2);
        boxBlur(small, 2);
        blurred = small;
    }

    private static void halo(Canvas c, Paint p, float x, float y, float r, int color) {
        p.setShader(new RadialGradient(x, y, r, color, color & 0x00FFFFFF, Shader.TileMode.CLAMP));
        c.drawCircle(x, y, r, p);
        p.setShader(null);
    }

    static int withA(int c, float a) { return (Math.round(a * 255) << 24) | (c & 0x00FFFFFF); }

    static int mix(int a, int b, float t) {
        int r = (int) (((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
        int g = (int) (((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
        int bl = (int) ((a & 255) * (1 - t) + (b & 255) * t);
        return 0xFF000000 | (r << 16) | (g << 8) | bl;
    }

    private static void boxBlur(Bitmap bmp, int r) {
        int w = bmp.getWidth(), h = bmp.getHeight();
        int[] px = new int[w * h], out = new int[w * h];
        bmp.getPixels(px, 0, w, 0, 0, w, h);
        for (int pass = 0; pass < 2; pass++) {
            boolean horiz = pass == 0;
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    int sa = 0, sr = 0, sg = 0, sb = 0, n = 0;
                    for (int k = -r; k <= r; k++) {
                        int xx = horiz ? Math.min(w - 1, Math.max(0, x + k)) : x;
                        int yy = horiz ? y : Math.min(h - 1, Math.max(0, y + k));
                        int c = px[yy * w + xx];
                        sa += (c >>> 24); sr += (c >> 16) & 255; sg += (c >> 8) & 255; sb += c & 255; n++;
                    }
                    out[y * w + x] = ((sa / n) << 24) | ((sr / n) << 16) | ((sg / n) << 8) | (sb / n);
                }
            }
            int[] tmp = px; px = out; out = tmp;
        }
        bmp.setPixels(px, 0, w, 0, 0, w, h);
    }

    // ------------------------------------------------------------ panneau en verre
    public static class Panel extends FrameLayout {
        private final Paint bmpPaint = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
        private final Paint tint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint shine = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint rim = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path clip = new Path();
        private final RectF rect = new RectF();
        private final Rect src = new Rect();
        private final RectF dst = new RectF();
        private final int[] loc = new int[2], rootLoc = new int[2];
        private float radius;
        private Theme theme;

        public Panel(Context c, Theme t, float radiusPx) {
            super(c);
            theme = t;
            radius = radiusPx;
            setWillNotDraw(false);
            setClipChildren(false);
            setClipToPadding(false);
            rim.setStyle(Paint.Style.STROKE);
            rim.setStrokeWidth(Math.max(1.5f, radiusPx * 0.06f));
        }

        @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
            super.onSizeChanged(w, h, ow, oh);
            rect.set(0, 0, w, h);
            clip.reset();
            clip.addRoundRect(rect, radius, radius, Path.Direction.CW);
            boolean light = theme.glassLight == 1;
            float op = theme.glassOpacity / 100f;
            tint.setColor(light ? withA(0xFFFFFF, 0.10f + op * 0.6f) : withA(0x000000, 0.05f + op * 0.45f));
            shine.setShader(new LinearGradient(0, 0, w * 0.35f, h, new int[]{withA(0xFFFFFF, light ? 0.45f : 0.22f), withA(0xFFFFFF, 0.03f), withA(0xFFFFFF, light ? 0.12f : 0.06f)},
                    new float[]{0, 0.45f, 1}, Shader.TileMode.CLAMP));
            rim.setShader(new LinearGradient(0, 0, w, h, new int[]{withA(0xFFFFFF, 0.85f), withA(0xFFFFFF, 0.08f), withA(0xFFFFFF, 0.02f), withA(0xFFFFFF, 0.45f)},
                    new float[]{0, 0.3f, 0.6f, 1}, Shader.TileMode.CLAMP));
        }

        @Override protected void onDraw(Canvas c) {
            int w = getWidth(), h = getHeight();
            if (w == 0 || h == 0) return;
            c.save();
            c.clipPath(clip);
            Bitmap b = blurred;
            if (b != null) {
                getLocationInWindow(loc);
                getRootView().getLocationInWindow(rootLoc);
                int rw = getRootView().getWidth(), rh = getRootView().getHeight();
                if (rw > 0 && rh > 0) {
                    float sx = b.getWidth() / (float) rw, sy = b.getHeight() / (float) rh;
                    int x = loc[0] - rootLoc[0], y = loc[1] - rootLoc[1];
                    src.set((int) (x * sx), (int) (y * sy), (int) ((x + w) * sx) + 1, (int) ((y + h) * sy) + 1);
                    dst.set(0, 0, w, h);
                    c.drawBitmap(b, src, dst, bmpPaint);
                }
            }
            c.drawRect(rect, tint);
            c.drawRect(rect, shine);
            c.restore();
            float i = rim.getStrokeWidth() / 2f;
            c.drawRoundRect(i, i, w - i, h - i, radius - i, radius - i, rim);
        }
    }
}
