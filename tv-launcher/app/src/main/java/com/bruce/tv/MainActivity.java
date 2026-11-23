package com.bruce.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.provider.MediaStore;
import android.content.ContentUris;
import android.Manifest;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Outline;
import android.graphics.PorterDuff;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Bruce TV — écran d'accueil Liquid Glass pour Google TV / Android TV.
 * Léger : fond calculé une fois, verre sans flou en temps réel, animations seulement au déplacement.
 * Aucune connexion Internet, aucune donnée collectée.
 */
public class MainActivity extends Activity {

    static class App { String pkg, label; Drawable banner, icon; }

    interface Opt { String label(); String value(); void step(int dir); boolean wall(); }

    private static final String[] DEFAULT_DOCK = {
            "com.netflix.ninja", "com.google.android.youtube.tv", "com.amazon.amazonvideo.livingroom",
            "com.disney.disneyplus", "com.canal.android.canal", "tv.molotov.app", "fr.francetv.pluzz",
            "com.spotify.tv.android", "com.apple.atve.androidtv.appletv", "org.videolan.vlc", "com.plexapp.android"
    };

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService bg = Executors.newSingleThreadExecutor();
    private final Map<String, App> apps = new LinkedHashMap<>();
    private SharedPreferences prefs;
    private Theme T;

    private FrameLayout root, home, overlay;
    private ImageView wallView, heroImage;
    private TextView clock, dateView, heroTitle, heroSub, tip;
    private View dot, heroImagePanel;
    private ImageView wifiIcon;
    private LinearLayout dockRow;
    private String builtWallKey = null;
    private int mode = 0; // 0 accueil · 1 toutes les applis · 2 réglages
    private int settingsIndex = 0;
    private boolean appsLoaded = false;
    private String lastDockFocus = null;
    private int introPage = 0;
    private String appsSig = "";

    private final Runnable tick = new Runnable() {
        @Override public void run() { updateClock(); ui.postDelayed(this, 1000 - (System.currentTimeMillis() % 1000)); }
    };
    private final Runnable wallJob = this::buildWall;
    private final BroadcastReceiver pkgReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) { loadApps(); }
    };

    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }
    private long dur(long ms) { return (long) (ms * T.animFactor()); }

    // ================================================================== démarrage
    @Override protected void onCreate(Bundle s) {
        super.onCreate(s);
        prefs = getSharedPreferences("bruce_tv", MODE_PRIVATE);
        T = loadTheme(prefs.getString("theme_cur", "glass"));
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        home = new FrameLayout(this);
        overlay = new FrameLayout(this);
        root.addView(home, new FrameLayout.LayoutParams(-1, -1));
        root.addView(overlay, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        root.post(this::buildWall);
        loadApps();
    }

    private Theme loadTheme(String id) {
        boolean known = false;
        for (String p : Theme.PRESET_IDS) if (p.equals(id)) known = true;
        if (!known) id = "glass";
        return Theme.fromJson(id, prefs.getString("theme_" + id, null));
    }

    private void saveTheme() {
        prefs.edit().putString("theme_" + T.id, T.toJson().toString()).putString("theme_cur", T.id).apply();
    }

    /** recalcule le fond en arrière-plan, puis reconstruit l'écran */
    private void buildWall() {
        final Theme t = T;
        final int w = root.getWidth() > 0 ? root.getWidth() : getResources().getDisplayMetrics().widthPixels;
        final int h = root.getHeight() > 0 ? root.getHeight() : getResources().getDisplayMetrics().heightPixels;
        final String key = t.wallKey();
        bg.execute(() -> {
            Glass.build(getApplicationContext(), t, w, h);
            ui.post(() -> { builtWallKey = key; refreshAll(); });
        });
    }

    private void loadApps() {
        bg.execute(() -> {
            PackageManager pm = getPackageManager();
            Map<String, App> found = new LinkedHashMap<>();
            for (String cat : new String[]{Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER}) {
                List<ResolveInfo> list = pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(cat), 0);
                for (ResolveInfo ri : list) {
                    String pkg = ri.activityInfo.packageName;
                    if (pkg.equals(getPackageName()) || found.containsKey(pkg)) continue;
                    App a = new App();
                    a.pkg = pkg;
                    a.label = String.valueOf(ri.loadLabel(pm));
                    try { a.banner = ri.activityInfo.loadBanner(pm); } catch (Exception ignored) {}
                    if (a.banner == null) try { a.banner = pm.getApplicationBanner(pkg); } catch (Exception ignored) {}
                    try { a.icon = ri.loadIcon(pm); } catch (Exception ignored) {}
                    found.put(pkg, a);
                }
            }
            List<App> sorted = new ArrayList<>(found.values());
            Collections.sort(sorted, (x, y) -> x.label.compareToIgnoreCase(y.label));
            ui.post(() -> {
                // on ne redessine que si la liste des applis a vraiment changé (retour à l'accueil instantané)
                StringBuilder sig = new StringBuilder();
                for (App a : sorted) sig.append(a.pkg).append('|').append(a.label).append(';');
                boolean changed = !sig.toString().equals(appsSig);
                appsSig = sig.toString();
                apps.clear();
                for (App a : sorted) apps.put(a.pkg, a);
                boolean first = !appsLoaded;
                appsLoaded = true;
                if (changed || first) refreshAll();
            });
        });
    }

    /** reconstruit l'accueil et, si ouvert, le panneau en cours (sans perdre la sélection) */
    private void refreshAll() {
        if (Glass.blurred == null) return;
        buildHome();
        if (mode == 1) openAll();
        else if (mode == 2) openSettings();
        else if (mode == 3) showIntro(introPage);
        else if (!prefs.getBoolean("intro_done", false) && appsLoaded) showIntro(0);
    }

    // ================================================================== écran d'accueil
    private TextView text(float sp, int color, String family, int style) {
        TextView t = new TextView(this);
        t.setTextSize(sp * T.ts());
        t.setTextColor(color);
        t.setTypeface(Typeface.create(family, style));
        t.setIncludeFontPadding(false);
        return t;
    }

    private FrameLayout.LayoutParams at(int w, int h, int gravity, int l, int t, int r, int b) {
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, h, gravity);
        lp.setMargins(dp(l), dp(t), dp(r), dp(b));
        return lp;
    }

    private void buildHome() {
        home.removeAllViews();
        boolean dockTop = T.dockPos == 1;

        wallView = new ImageView(this);
        wallView.setScaleType(ImageView.ScaleType.FIT_XY);
        wallView.setImageBitmap(Glass.wall);
        home.addView(wallView, new FrameLayout.LayoutParams(-1, -1));

        // --- heure et date (marges larges : rien n'est coupé sur un vidéoprojecteur)
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.VERTICAL);
        if (T.clockStyle != 2) {
            clock = text(58, T.textColor(), T.clockStyle == 0 ? "sans-serif-thin" : "sans-serif-black", Typeface.NORMAL);
            clock.setLetterSpacing(-0.03f);
            top.addView(clock);
        } else clock = null;
        dateView = text(16, T.dim(0xB0), "sans-serif-medium", Typeface.NORMAL);
        dateView.setPadding(dp(3), dp(6), 0, 0);
        top.addView(dateView);
        home.addView(top, at(-2, -2, Gravity.TOP | Gravity.START, 52, 30, 0, 0));

        // --- pastille en verre en haut à droite
        Glass.Panel pill = new Glass.Panel(this, T, dp(24));
        LinearLayout pr = new LinearLayout(this);
        pr.setOrientation(LinearLayout.HORIZONTAL);
        pr.setGravity(Gravity.CENTER_VERTICAL);
        pr.setPadding(dp(16), 0, dp(6), 0);
        wifiIcon = new ImageView(this);
        wifiIcon.setImageResource(R.drawable.ic_wifi);
        wifiIcon.setColorFilter(T.textColor(), PorterDuff.Mode.SRC_IN);
        pr.addView(wifiIcon, new LinearLayout.LayoutParams(dp(20), dp(20)));
        TextView av = text(15, isLight(T.accentColor()) ? Color.BLACK : Color.WHITE, "sans-serif-black", Typeface.NORMAL);
        av.setText("B");
        av.setGravity(Gravity.CENTER);
        GradientDrawable avBg = new GradientDrawable();
        avBg.setShape(GradientDrawable.OVAL);
        avBg.setColor(T.accentColor());
        av.setBackground(avBg);
        LinearLayout.LayoutParams avLp = new LinearLayout.LayoutParams(dp(36), dp(36));
        avLp.leftMargin = dp(14);
        pr.addView(av, avLp);
        pill.addView(pr, new FrameLayout.LayoutParams(-2, -1));
        home.addView(pill, at(-2, dp(48), Gravity.TOP | Gravity.END, 0, 34, 52, 0));

        // --- grand titre de l'appli sélectionnée
        heroTitle = null; heroSub = null; heroImage = null; heroImagePanel = null;
        if (T.showHero) {
            LinearLayout hero = new LinearLayout(this);
            hero.setOrientation(LinearLayout.VERTICAL);
            TextView kicker = text(12, T.dim(0x99), "sans-serif-medium", Typeface.BOLD);
            kicker.setText("SÉLECTIONNÉ");
            kicker.setLetterSpacing(0.3f);
            hero.addView(kicker);
            heroTitle = text(46, T.textColor(), "sans-serif", Typeface.BOLD);
            heroTitle.setLetterSpacing(-0.02f);
            heroTitle.setSingleLine(true);
            heroTitle.setEllipsize(TextUtils.TruncateAt.END);
            heroTitle.setPadding(0, dp(8), 0, 0);
            hero.addView(heroTitle);
            heroSub = text(15, T.dim(0xB0), "sans-serif", Typeface.NORMAL);
            heroSub.setPadding(0, dp(10), 0, 0);
            hero.addView(heroSub);
            int heroTop = dockTop ? 270 : 170;
            home.addView(hero, at(dp(T.showBanner ? 520 : 820), -2, Gravity.TOP | Gravity.START, 52, heroTop, 0, 0));
            if (T.showBanner) {
                Glass.Panel bp = new Glass.Panel(this, T, dp(T.radius));
                bp.setPadding(dp(7), dp(7), dp(7), dp(7));
                heroImage = new ImageView(this);
                heroImage.setScaleType(ImageView.ScaleType.CENTER_CROP);
                final float rr = dp(Math.max(4, T.radius - 7));
                heroImage.setClipToOutline(true);
                heroImage.setOutlineProvider(new ViewOutlineProvider() {
                    @Override public void getOutline(View v, Outline o) { o.setRoundRect(0, 0, v.getWidth(), v.getHeight(), rr); }
                });
                bp.addView(heroImage, new FrameLayout.LayoutParams(-1, -1));
                heroImagePanel = bp;
                home.addView(bp, at(dp(300), dp(169), Gravity.TOP | Gravity.END, 0, heroTop - 12, 52, 0));
            }
        }

        // --- la barre des tâches (dock) en verre
        int tile = dp(T.dockTile());
        Glass.Panel dock = new Glass.Panel(this, T, dp(Math.min(44, T.radius + 14)));
        HorizontalScrollView hs = new HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        hs.setClipChildren(false);
        hs.setClipToPadding(false);
        hs.setOverScrollMode(View.OVER_SCROLL_NEVER);
        dockRow = new LinearLayout(this);
        dockRow.setOrientation(LinearLayout.HORIZONTAL);
        dockRow.setGravity(Gravity.CENTER_VERTICAL);
        dockRow.setClipChildren(false);
        dockRow.setClipToPadding(false);
        int pad = dp(14);
        dockRow.setPadding(pad, pad, pad, pad);
        hs.addView(dockRow);
        dock.addView(hs, new FrameLayout.LayoutParams(-2, -2));
        FrameLayout.LayoutParams dlp = new FrameLayout.LayoutParams(-2, -2, (dockTop ? Gravity.TOP : Gravity.BOTTOM) | Gravity.CENTER_HORIZONTAL);
        dlp.setMargins(dp(52), dockTop ? dp(150) : 0, dp(52), dockTop ? 0 : dp(30));
        home.addView(dock, dlp);

        View first = null, refocus = null;
        for (String p : dockList()) {
            final App a = apps.get(p);
            View v = dockTile(a.label, a.icon != null ? a.icon : a.banner, false, () -> launch(a.pkg), () -> appMenu(a, true),
                    "OK pour ouvrir  ·  ☰ pour les options", a.banner != null ? a.banner : a.icon);
            v.setTag(a.pkg);
            addDock(v, tile);
            if (first == null) first = v;
            if (a.pkg.equals(lastDockFocus)) refocus = v;
        }
        View sep = new View(this);
        sep.setBackgroundColor(T.dim(0x40));
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(dp(2), (int) (tile * 0.7f));
        slp.setMargins(dp(4), 0, dp(14), 0);
        if (dockRow.getChildCount() > 0) dockRow.addView(sep, slp);
        View all = dockTile("Toutes les applis", getDrawable(R.drawable.ic_grid), true, this::openAll, null, "Toutes tes applications installées", null);
        all.setTag("__all");
        addDock(all, tile);
        View set = dockTile("Réglages", getDrawable(R.drawable.ic_gear), true, this::openSettings, null, "Thèmes, couleurs, taille… tout se personnalise", null);
        set.setTag("__settings");
        addDock(set, tile);
        if (first == null) first = all;
        if ("__all".equals(lastDockFocus)) refocus = all;
        if ("__settings".equals(lastDockFocus)) refocus = set;

        // --- étiquette flottante + point sous l'appli sélectionnée
        tip = text(15, T.textColor(), "sans-serif-medium", Typeface.BOLD);
        tip.setPadding(dp(14), dp(7), dp(14), dp(7));
        GradientDrawable tb = new GradientDrawable();
        tb.setCornerRadius(dp(99));
        tb.setColor(T.glassLight == 1 ? 0xD9FFFFFF : 0xB3000000);
        tip.setBackground(tb);
        tip.setVisibility(View.INVISIBLE);
        home.addView(tip, new FrameLayout.LayoutParams(-2, -2));
        dot = new View(this);
        GradientDrawable db = new GradientDrawable();
        db.setShape(GradientDrawable.OVAL);
        db.setColor(T.textColor());
        dot.setBackground(db);
        dot.setVisibility(View.INVISIBLE);
        home.addView(dot, new FrameLayout.LayoutParams(dp(7), dp(7)));

        updateClock();
        if (mode == 0) {
            final View f = refocus != null ? refocus : first;
            f.requestFocus();
        }
    }

    private void addDock(View v, int tile) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(tile, tile);
        lp.rightMargin = dp(14);
        dockRow.addView(v, lp);
    }

    private List<String> dockList() {
        String s = prefs.getString("dock", null);
        List<String> out = new ArrayList<>();
        if (s == null) {
            if (!appsLoaded) return out;
            for (String p : DEFAULT_DOCK) if (apps.containsKey(p)) out.add(p);
            if (out.isEmpty()) for (App a : apps.values()) { out.add(a.pkg); if (out.size() >= 6) break; }
            saveDock(out);
            return out;
        }
        for (String p : s.split(",")) if (!p.isEmpty() && apps.containsKey(p) && !out.contains(p)) out.add(p);
        return out;
    }

    private void saveDock(List<String> l) { prefs.edit().putString("dock", TextUtils.join(",", l)).apply(); }

    private static boolean isLight(int c) {
        double l = 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
        return l > 150;
    }

    private void applyIconStyle(ImageView iv, boolean glyph, boolean focused) {
        if (glyph) {
            int c = focused ? (isLight(T.accentColor()) ? 0xFF111111 : Color.WHITE) : T.textColor();
            iv.setColorFilter(c, PorterDuff.Mode.SRC_IN);
        } else if (T.iconMono == 1 && !focused) {
            ColorMatrix m = new ColorMatrix();
            m.setSaturation(0);
            iv.setColorFilter(new ColorMatrixColorFilter(m));
        } else iv.clearColorFilter();
    }

    private GradientDrawable tileBg(boolean focused, float r) {
        GradientDrawable g = new GradientDrawable();
        g.setCornerRadius(r);
        if (focused) {
            g.setColors(new int[]{T.accentColor(), Glass.mix(T.accentColor(), 0xFF000000, 0.12f)});
            g.setOrientation(GradientDrawable.Orientation.TL_BR);
            g.setStroke(dp(1.5f), 0xFFFFFFFF);
        } else {
            g.setColor(T.glassLight == 1 ? 0x59FFFFFF : 0x1AFFFFFF);
            g.setStroke(dp(1), 0x2EFFFFFF);
        }
        return g;
    }

    private View dockTile(final String label, Drawable icon, final boolean glyph, final Runnable click, final Runnable menu, final String sub, final Drawable heroImg) {
        final FrameLayout v = new FrameLayout(this);
        final float r = dp(Math.max(10, T.radius * 0.75f));
        v.setFocusable(true);
        v.setFocusableInTouchMode(true);
        v.setBackground(tileBg(false, r));
        final ImageView iv = new ImageView(this);
        iv.setImageDrawable(icon);
        iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
        applyIconStyle(iv, glyph, false);
        int is = (int) (dp(T.dockTile()) * (glyph ? 0.46f : 0.66f));
        v.addView(iv, new FrameLayout.LayoutParams(is, is, Gravity.CENTER));
        final float z = T.zoom / 100f;
        v.setOnFocusChangeListener((view, has) -> {
            view.setBackground(tileBg(has, r));
            applyIconStyle(iv, glyph, has);
            view.animate().cancel();
            view.animate().scaleX(has ? z : 1f).scaleY(has ? z : 1f).translationZ(has ? dp(10) : 0)
                    .setDuration(dur(has ? 200 : 150))
                    .setInterpolator(has ? new OvershootInterpolator(1.3f) : new DecelerateInterpolator()).start();
            if (has) {
                lastDockFocus = (String) view.getTag();
                showHero(label, sub, heroImg);
                moveTip(view, label);
            }
        });
        v.setOnClickListener(view -> click.run());
        if (menu != null) {
            v.setOnLongClickListener(view -> { menu.run(); return true; });
            v.setOnKeyListener((view, code, e) -> {
                if (e.getAction() == KeyEvent.ACTION_UP && (code == KeyEvent.KEYCODE_MENU || code == KeyEvent.KEYCODE_SETTINGS)) { menu.run(); return true; }
                return false;
            });
        }
        return v;
    }

    private void showHero(String label, String sub, Drawable img) {
        if (heroTitle != null) {
            heroTitle.setText(label);
            heroSub.setText(sub);
            if (T.anim != 2) { heroTitle.setAlpha(0.3f); heroTitle.animate().alpha(1f).setDuration(dur(220)).start(); }
        }
        if (heroImage != null) {
            heroImage.setImageDrawable(img);
            heroImagePanel.setVisibility(img != null ? View.VISIBLE : View.INVISIBLE);
        }
    }

    private void moveTip(final View tileView, final String label) {
        tip.setText(label);
        tip.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED);
        tileView.post(() -> {
            int[] a = new int[2], b = new int[2];
            tileView.getLocationInWindow(a);
            home.getLocationInWindow(b);
            float cx = a[0] - b[0] + tileView.getWidth() / 2f;
            float tileTop = a[1] - b[1], tileBottom = tileTop + tileView.getHeight();
            boolean dockTop = T.dockPos == 1;
            float z = T.zoom / 100f, grow = tileView.getHeight() * (z - 1) / 2f;
            float tx = Math.max(dp(20), Math.min(home.getWidth() - tip.getMeasuredWidth() - dp(20), cx - tip.getMeasuredWidth() / 2f));
            float ty = dockTop ? tileBottom + grow + dp(28) : tileTop - grow - tip.getMeasuredHeight() - dp(26);
            float dx = cx - dp(3.5f), dy = dockTop ? tileTop - grow - dp(14) : tileBottom + grow + dp(9);
            if (tip.getVisibility() != View.VISIBLE || T.anim == 2) {
                tip.setX(tx); tip.setY(ty); dot.setX(dx); dot.setY(dy);
                tip.setVisibility(View.VISIBLE); dot.setVisibility(View.VISIBLE);
            } else {
                tip.animate().x(tx).y(ty).setDuration(dur(180)).setInterpolator(new DecelerateInterpolator()).start();
                dot.animate().x(dx).y(dy).setDuration(dur(180)).setInterpolator(new DecelerateInterpolator()).start();
            }
        });
    }

    // ================================================================== toutes les applis
    private void openAll() {
        mode = 1;
        overlay.removeAllViews();
        View dim = new View(this);
        dim.setBackgroundColor(0x99000000);
        overlay.addView(dim, new FrameLayout.LayoutParams(-1, -1));
        Glass.Panel panel = new Glass.Panel(this, T, dp(T.radius + 8));
        overlay.addView(panel, at(-1, -1, Gravity.CENTER, 52, 40, 52, 40));
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(32), dp(26), dp(32), dp(10));
        col.setClipChildren(false);
        panel.addView(col, new FrameLayout.LayoutParams(-1, -1));
        TextView title = text(26, T.textColor(), "sans-serif", Typeface.BOLD);
        title.setText("Toutes les applis");
        col.addView(title);
        TextView hint = text(13, T.dim(0x99), "sans-serif", Typeface.NORMAL);
        hint.setText("OK pour ouvrir  ·  appui long ou ☰ : barre des tâches, désinstaller…  ·  Retour pour fermer");
        hint.setPadding(0, dp(6), 0, dp(14));
        col.addView(hint);
        ScrollView sv = new ScrollView(this);
        sv.setVerticalScrollBarEnabled(false);
        sv.setClipChildren(false);
        sv.setClipToPadding(false);
        col.addView(sv, new LinearLayout.LayoutParams(-1, 0, 1f));
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(6);
        grid.setClipChildren(false);
        grid.setClipToPadding(false);
        grid.setPadding(dp(8), dp(10), dp(8), dp(20));
        sv.addView(grid);
        View first = null;
        for (final App a : apps.values()) {
            final LinearLayout t = new LinearLayout(this);
            t.setOrientation(LinearLayout.VERTICAL);
            t.setGravity(Gravity.CENTER);
            t.setPadding(dp(6), dp(10), dp(6), dp(8));
            t.setFocusable(true);
            t.setFocusableInTouchMode(true);
            final float r = dp(Math.max(10, T.radius * 0.7f));
            t.setBackground(tileBg(false, r));
            final ImageView iv = new ImageView(this);
            iv.setImageDrawable(a.icon != null ? a.icon : a.banner);
            applyIconStyle(iv, false, false);
            t.addView(iv, new LinearLayout.LayoutParams(dp(44), dp(44)));
            final TextView l = text(12, T.textColor(), "sans-serif-medium", Typeface.NORMAL);
            l.setText(a.label);
            l.setSingleLine(true);
            l.setEllipsize(TextUtils.TruncateAt.END);
            l.setGravity(Gravity.CENTER);
            l.setPadding(0, dp(8), 0, 0);
            t.addView(l, new LinearLayout.LayoutParams(-1, -2));
            t.setOnFocusChangeListener((view, has) -> {
                view.setBackground(tileBg(has, r));
                applyIconStyle(iv, false, has);
                l.setTextColor(has ? (isLight(T.accentColor()) ? 0xFF111111 : Color.WHITE) : T.textColor());
                view.animate().scaleX(has ? 1.1f : 1f).scaleY(has ? 1.1f : 1f).translationZ(has ? dp(8) : 0).setDuration(dur(160)).start();
            });
            t.setOnClickListener(view -> { closeOverlay(); launch(a.pkg); });
            t.setOnLongClickListener(view -> { appMenu(a, false); return true; });
            t.setOnKeyListener((view, code, e) -> {
                if (e.getAction() == KeyEvent.ACTION_UP && (code == KeyEvent.KEYCODE_MENU || code == KeyEvent.KEYCODE_SETTINGS)) { appMenu(a, false); return true; }
                return false;
            });
            GridLayout.LayoutParams lp = new GridLayout.LayoutParams();
            lp.width = dp(104);
            lp.height = dp(96);
            lp.setMargins(dp(6), dp(6), dp(6), dp(6));
            grid.addView(t, lp);
            if (first == null) first = t;
        }
        if (first != null) first.requestFocus();
        if (T.anim != 2) { panel.setAlpha(0f); panel.setScaleX(0.97f); panel.setScaleY(0.97f); panel.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(dur(200)).start(); }
    }

    private void closeOverlay() {
        mode = 0;
        overlay.removeAllViews();
        buildHome();
    }

    // ================================================================== réglages
    private static int cyc(int v, int n, int dir) { return ((v + dir) % n + n) % n; }
    private static int rng(int v, int min, int max, int step, int dir) { int x = v + dir * step; if (x > max) x = min; if (x < min) x = max; return x; }

    private Opt opt(String label, java.util.function.Supplier<String> val, java.util.function.IntConsumer st, boolean wall) {
        return new Opt() {
            public String label() { return label; }
            public String value() { return val.get(); }
            public void step(int d) { st.accept(d); }
            public boolean wall() { return wall; }
        };
    }

    private List<Opt> options() {
        List<Opt> o = new ArrayList<>();
        final String[] onoff = {"Affiché", "Masqué"};
        o.add(opt("Thème", () -> T.name, d -> {
            int i = 0;
            for (int k = 0; k < Theme.PRESET_IDS.length; k++) if (Theme.PRESET_IDS[k].equals(T.id)) i = k;
            T = loadTheme(Theme.PRESET_IDS[cyc(i, Theme.PRESET_IDS.length, d)]);
        }, true));
        o.add(opt("Couleur de sélection", () -> Theme.COLOR_NAMES[T.accent], d -> T.accent = cyc(T.accent, Theme.COLORS.length, d), false));
        o.add(opt("Couleur du texte", () -> Theme.COLOR_NAMES[T.text], d -> T.text = cyc(T.text, Theme.COLORS.length, d), false));
        o.add(opt("Fond · couleur", () -> Theme.BASE_NAMES[T.base], d -> T.base = cyc(T.base, Theme.BASES.length, d), true));
        o.add(opt("Fond · lumière principale", () -> Theme.GLOW_NAMES[T.glow1], d -> T.glow1 = cyc(T.glow1, Theme.GLOWS.length, d), true));
        o.add(opt("Fond · lumière secondaire", () -> Theme.GLOW_NAMES[T.glow2], d -> T.glow2 = cyc(T.glow2, Theme.GLOWS.length, d), true));
        o.add(opt("Fond · style", () -> new String[]{"Rubans liquides", "Halos", "Dégradé", "Uni", "Mon image"}[T.wallStyle], d -> {
            T.wallStyle = cyc(T.wallStyle, 5, d);
            if (T.wallStyle == 4) { ensureImagePermission(); if (T.wallImage.isEmpty()) { List<String[]> im = images(); if (!im.isEmpty()) T.wallImage = im.get(0)[0]; } }
        }, true));
        if (T.wallStyle == 4) {
            o.add(opt("Fond · image", this::imageLabel, d -> {
                List<String[]> im = images();
                if (im.isEmpty()) return;
                int i = 0;
                for (int k = 0; k < im.size(); k++) if (im.get(k)[0].equals(T.wallImage)) i = k;
                T.wallImage = im.get(cyc(i, im.size(), d))[0];
            }, true));
            o.add(opt("Fond · assombrir l'image", () -> T.wallDim + " %", d -> T.wallDim = rng(T.wallDim, 0, 80, 10, d), true));
        }
        o.add(opt("Verre · teinte", () -> T.glassLight == 1 ? "Clair" : "Sombre", d -> T.glassLight = cyc(T.glassLight, 2, d), false));
        o.add(opt("Verre · opacité", () -> T.glassOpacity + " %", d -> T.glassOpacity = rng(T.glassOpacity, 10, 90, 10, d), false));
        o.add(opt("Verre · flou", () -> T.blur + " / 5", d -> T.blur = rng(T.blur, 1, 5, 1, d), true));
        o.add(opt("Arrondi des angles", () -> T.radius + "", d -> T.radius = rng(T.radius, 8, 40, 4, d), false));
        o.add(opt("Barre des tâches · taille", () -> new String[]{"Petite", "Normale", "Grande"}[T.dockSize], d -> T.dockSize = cyc(T.dockSize, 3, d), false));
        o.add(opt("Barre des tâches · position", () -> T.dockPos == 1 ? "En haut" : "En bas", d -> T.dockPos = cyc(T.dockPos, 2, d), false));
        o.add(opt("Icônes", () -> T.iconMono == 1 ? "Noir et blanc" : "En couleurs", d -> T.iconMono = cyc(T.iconMono, 2, d), false));
        o.add(opt("Zoom de sélection", () -> T.zoom + " %", d -> T.zoom = rng(T.zoom, 100, 150, 5, d), false));
        o.add(opt("Taille du texte", () -> T.textScale + " %", d -> T.textScale = rng(T.textScale, 80, 150, 10, d), false));
        o.add(opt("Horloge", () -> new String[]{"Fine", "Grasse", "Masquée"}[T.clockStyle], d -> T.clockStyle = cyc(T.clockStyle, 3, d), false));
        o.add(opt("Format de l'heure", () -> T.h24 ? "24 h" : "12 h", d -> T.h24 = !T.h24, false));
        o.add(opt("Date", () -> onoff[T.showDate ? 0 : 1], d -> T.showDate = !T.showDate, false));
        o.add(opt("Message d'accueil", () -> Theme.GREETINGS[T.greeting] == null ? "Aucun" : ("Bonsoir" + Theme.GREETINGS[T.greeting]), d -> T.greeting = cyc(T.greeting, Theme.GREETINGS.length, d), false));
        o.add(opt("Grand titre", () -> onoff[T.showHero ? 0 : 1], d -> T.showHero = !T.showHero, false));
        o.add(opt("Image de l'appli", () -> onoff[T.showBanner ? 0 : 1], d -> T.showBanner = !T.showBanner, false));
        o.add(opt("Animations", () -> new String[]{"Rapides", "Normales", "Aucune"}[T.anim], d -> T.anim = cyc(T.anim, 3, d), false));
        return o;
    }

    private void openSettings() {
        if (mode != 2) settingsIndex = 0;
        mode = 2;
        overlay.removeAllViews();
        View dim = new View(this);
        dim.setBackgroundColor(0x66000000);
        overlay.addView(dim, new FrameLayout.LayoutParams(-1, -1));
        Glass.Panel panel = new Glass.Panel(this, T, dp(T.radius + 8));
        overlay.addView(panel, at(dp(520), -1, Gravity.END, 0, 30, 40, 30));
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(24), dp(22), dp(24), dp(10));
        panel.addView(col, new FrameLayout.LayoutParams(-1, -1));
        TextView title = text(26, T.textColor(), "sans-serif", Typeface.BOLD);
        title.setText("Réglages");
        col.addView(title);
        TextView hint = text(12, T.dim(0x99), "sans-serif", Typeface.NORMAL);
        hint.setText("◀ ▶ ou OK pour changer · chaque thème garde ses propres réglages");
        hint.setPadding(0, dp(6), 0, dp(12));
        col.addView(hint);
        ScrollView sv = new ScrollView(this);
        sv.setVerticalScrollBarEnabled(false);
        col.addView(sv, new LinearLayout.LayoutParams(-1, 0, 1f));
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setPadding(0, dp(4), 0, dp(16));
        sv.addView(list);

        final List<Opt> opts = options();
        final List<View> rows = new ArrayList<>();
        for (int i = 0; i < opts.size(); i++) {
            final Opt op = opts.get(i);
            final int idx = i;
            View row = settingRow(op.label(), "‹  " + op.value() + "  ›", dir -> {
                settingsIndex = idx;
                String before = T.wallKey();
                op.step(dir);
                saveTheme();
                if (op.wall() || !T.wallKey().equals(before)) {
                    // fond à recalculer : on regroupe les appuis rapides
                    ui.removeCallbacks(wallJob);
                    ui.postDelayed(wallJob, 260);
                    openSettings();
                } else refreshAll();
            });
            list.addView(row);
            rows.add(row);
        }
        final int base = opts.size();
        rows.add(addAction(list, "Réinitialiser ce thème", () -> {
            settingsIndex = base;
            prefs.edit().remove("theme_" + T.id).apply();
            T = Theme.preset(T.id);
            saveTheme();
            buildWall();
        }));
        rows.add(addAction(list, "Revoir la présentation", () -> { settingsIndex = base + 1; showIntro(0); }));
        rows.add(addAction(list, "Paramètres de la clé TV", () -> {
            settingsIndex = base + 2;
            try { startActivity(new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) {}
        }));
        rows.add(addAction(list, "Fermer", this::closeOverlay));
        View target = rows.get(Math.min(Math.max(0, settingsIndex), rows.size() - 1));
        target.requestFocus();
    }

    interface Step { void go(int dir); }

    private GradientDrawable rowBg(boolean focused) {
        GradientDrawable g = new GradientDrawable();
        g.setCornerRadius(dp(Math.max(8, T.radius * 0.6f)));
        g.setColor(focused ? T.accentColor() : 0x00000000);
        return g;
    }

    private View settingRow(String label, String value, final Step step) {
        final LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(dp(14), dp(11), dp(14), dp(11));
        r.setFocusable(true);
        r.setFocusableInTouchMode(true);
        r.setBackground(rowBg(false));
        final TextView l = text(15, T.textColor(), "sans-serif-medium", Typeface.NORMAL);
        l.setText(label);
        r.addView(l, new LinearLayout.LayoutParams(0, -2, 1f));
        final TextView v = text(15, T.dim(0xCC), "sans-serif", Typeface.BOLD);
        v.setText(value);
        r.addView(v);
        r.setOnFocusChangeListener((view, has) -> {
            view.setBackground(rowBg(has));
            int c = has ? (isLight(T.accentColor()) ? 0xFF111111 : Color.WHITE) : T.textColor();
            l.setTextColor(c);
            v.setTextColor(has ? c : T.dim(0xCC));
        });
        r.setOnKeyListener((view, code, e) -> {
            if (e.getAction() != KeyEvent.ACTION_DOWN) return code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT;
            if (code == KeyEvent.KEYCODE_DPAD_LEFT) { step.go(-1); return true; }
            if (code == KeyEvent.KEYCODE_DPAD_RIGHT) { step.go(1); return true; }
            return false;
        });
        r.setOnClickListener(view -> step.go(1));
        return r;
    }

    private View addAction(LinearLayout list, String label, final Runnable run) {
        View row = settingRow(label, "", d -> run.run());
        list.addView(row);
        return row;
    }

    // ================================================================== présentation (premier démarrage)
    private static final String[][] INTRO = {
            {"✦", "Bienvenue sur Bruce TV", "Un écran d'accueil créé par Bruce, avec Claude, l'IA d'Anthropic.\nFait sur mesure pour cette clé TV et le vidéoprojecteur."},
            {"⚡", "Rapide et léger", "Pas de pubs, pas de vidéos qui se lancent toutes seules, pas de recommandations.\nJuste tes applis, et une interface fluide même sur une petite clé."},
            {"◐", "Vrai Liquid Glass", "Des panneaux en verre, une barre des tâches façon Apple,\net 7 thèmes prêts à l'emploi."},
            {"✎", "Tout se personnalise", "Couleurs, fond, ta propre image, taille du texte, barre des tâches, horloge…\nChaque thème garde ses propres réglages."},
            {"🔒", "Ta vie privée", "Bruce TV n'utilise pas Internet et ne collecte aucune donnée.\nTout reste sur la clé."},
            {"◎", "Comment ça marche", "◀ ▶ pour choisir une appli · OK pour l'ouvrir\nAppui long ou ☰ : options · Réglages : tout personnaliser"}
    };

    private void showIntro(int page) {
        mode = 3;
        introPage = Math.max(0, Math.min(INTRO.length - 1, page));
        overlay.removeAllViews();
        View dim = new View(this);
        dim.setBackgroundColor(0xB3000000);
        overlay.addView(dim, new FrameLayout.LayoutParams(-1, -1));
        Glass.Panel panel = new Glass.Panel(this, T, dp(T.radius + 14));
        overlay.addView(panel, at(dp(700), dp(400), Gravity.CENTER, 0, 0, 0, 0));
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        col.setPadding(dp(48), dp(34), dp(48), dp(26));
        panel.addView(col, new FrameLayout.LayoutParams(-1, -1));

        String[] p = INTRO[introPage];
        TextView icon = text(44, T.textColor(), "sans-serif", Typeface.NORMAL);
        icon.setText(p[0]);
        icon.setGravity(Gravity.CENTER);
        col.addView(icon);
        TextView title = text(34, T.textColor(), "sans-serif", Typeface.BOLD);
        title.setText(p[1]);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(18), 0, 0);
        col.addView(title);
        TextView body = text(17, T.dim(0xC8), "sans-serif", Typeface.NORMAL);
        body.setText(p[2]);
        body.setGravity(Gravity.CENTER);
        body.setLineSpacing(dp(4), 1f);
        body.setPadding(0, dp(16), 0, 0);
        col.addView(body, new LinearLayout.LayoutParams(-1, 0, 1f));

        LinearLayout dots = new LinearLayout(this);
        dots.setGravity(Gravity.CENTER);
        for (int i = 0; i < INTRO.length; i++) {
            View d = new View(this);
            GradientDrawable g = new GradientDrawable();
            g.setCornerRadius(dp(4));
            g.setColor(i == introPage ? T.textColor() : T.dim(0x44));
            d.setBackground(g);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(i == introPage ? 26 : 8), dp(8));
            lp.setMargins(dp(4), 0, dp(4), 0);
            dots.addView(d, lp);
        }
        col.addView(dots);

        boolean last = introPage == INTRO.length - 1;
        final TextView btn = text(18, isLight(T.accentColor()) ? 0xFF111111 : Color.WHITE, "sans-serif-medium", Typeface.BOLD);
        btn.setText(last ? "C'est parti" : "Suivant  ▶");
        btn.setGravity(Gravity.CENTER);
        btn.setPadding(dp(34), dp(13), dp(34), dp(13));
        GradientDrawable bb = new GradientDrawable();
        bb.setCornerRadius(dp(99));
        bb.setColor(T.accentColor());
        btn.setBackground(bb);
        btn.setFocusable(true);
        btn.setFocusableInTouchMode(true);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(-2, -2);
        blp.topMargin = dp(18);
        col.addView(btn, blp);
        TextView hint = text(12, T.dim(0x80), "sans-serif", Typeface.NORMAL);
        hint.setText(introPage > 0 ? "◀ page précédente  ·  Retour pour passer" : "Retour pour passer la présentation");
        hint.setPadding(0, dp(10), 0, 0);
        col.addView(hint);

        btn.setOnClickListener(v -> { if (introPage == INTRO.length - 1) finishIntro(); else showIntro(introPage + 1); });
        btn.setOnKeyListener((v, code, e) -> {
            if (e.getAction() != KeyEvent.ACTION_DOWN) return code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT;
            if (code == KeyEvent.KEYCODE_DPAD_RIGHT) { if (introPage < INTRO.length - 1) showIntro(introPage + 1); return true; }
            if (code == KeyEvent.KEYCODE_DPAD_LEFT) { if (introPage > 0) showIntro(introPage - 1); return true; }
            return false;
        });
        btn.requestFocus();
        if (T.anim != 2) {
            col.setAlpha(0f);
            col.setTranslationX(dp(18));
            col.animate().alpha(1f).translationX(0).setDuration(dur(260)).setInterpolator(new DecelerateInterpolator()).start();
        }
    }

    private void finishIntro() {
        prefs.edit().putBoolean("intro_done", true).apply();
        closeOverlay();
    }

    // ================================================================== images de la clé (pour le fond)
    private boolean hasImagePermission() {
        String p = Build.VERSION.SDK_INT >= 33 ? Manifest.permission.READ_MEDIA_IMAGES : Manifest.permission.READ_EXTERNAL_STORAGE;
        return checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED;
    }

    private void ensureImagePermission() {
        if (hasImagePermission()) return;
        String p = Build.VERSION.SDK_INT >= 33 ? Manifest.permission.READ_MEDIA_IMAGES : Manifest.permission.READ_EXTERNAL_STORAGE;
        requestPermissions(new String[]{p}, 7);
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == 7 && hasImagePermission()) {
            if (T.wallImage.isEmpty()) { List<String[]> im = images(); if (!im.isEmpty()) T.wallImage = im.get(0)[0]; }
            saveTheme();
            buildWall();
        }
    }

    /** les 60 images les plus récentes de la clé : {uri, nom} */
    private List<String[]> images() {
        List<String[]> out = new ArrayList<>();
        if (!hasImagePermission()) return out;
        String[] proj = {MediaStore.Images.Media._ID, MediaStore.Images.Media.DISPLAY_NAME};
        try (Cursor c = getContentResolver().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, proj, null, null, MediaStore.Images.Media.DATE_ADDED + " DESC")) {
            if (c == null) return out;
            int id = c.getColumnIndexOrThrow(MediaStore.Images.Media._ID), nm = c.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
            while (c.moveToNext() && out.size() < 60) {
                out.add(new String[]{ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, c.getLong(id)).toString(), c.getString(nm)});
            }
        } catch (Exception ignored) {}
        return out;
    }

    private String imageLabel() {
        if (!hasImagePermission()) return "Autoriser l'accès";
        List<String[]> im = images();
        if (im.isEmpty()) return "Aucune image sur la clé";
        for (String[] x : im) if (x[0].equals(T.wallImage)) return x[1].length() > 22 ? x[1].substring(0, 21) + "…" : x[1];
        return "Choisir";
    }

    // ================================================================== actions
    private void launch(String pkg) {
        PackageManager pm = getPackageManager();
        Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
        if (i == null) i = pm.getLaunchIntentForPackage(pkg);
        if (i == null) return;
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { startActivity(i); } catch (Exception ignored) {}
    }

    private void appMenu(final App a, boolean fromDock) {
        final List<String> dl = dockList();
        final boolean inDock = dl.contains(a.pkg);
        final int idx = dl.indexOf(a.pkg);
        final List<String> labels = new ArrayList<>();
        final List<Runnable> acts = new ArrayList<>();
        labels.add(inDock ? "Retirer de la barre des tâches" : "Ajouter à la barre des tâches");
        acts.add(() -> { if (inDock) dl.remove(a.pkg); else dl.add(a.pkg); saveDock(dl); refreshAll(); });
        if (inDock && idx > 0) { labels.add("◀  Déplacer à gauche"); acts.add(() -> { Collections.swap(dl, idx, idx - 1); saveDock(dl); refreshAll(); }); }
        if (inDock && idx < dl.size() - 1) { labels.add("Déplacer à droite  ▶"); acts.add(() -> { Collections.swap(dl, idx, idx + 1); saveDock(dl); refreshAll(); }); }
        labels.add("Infos de l'appli");
        acts.add(() -> { try { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.pkg)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) {} });
        labels.add("Désinstaller");
        acts.add(() -> { try { startActivity(new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + a.pkg)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) {} });
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(a.label)
                .setItems(labels.toArray(new String[0]), (d, w) -> acts.get(w).run())
                .show();
    }

    private void updateClock() {
        Date now = new Date();
        if (clock != null) clock.setText(new SimpleDateFormat(T.h24 ? "HH:mm" : "h:mm", Locale.FRANCE).format(now));
        if (dateView != null) {
            StringBuilder sb = new StringBuilder();
            String g = Theme.GREETINGS[T.greeting];
            if (g != null) {
                int h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
                sb.append(h >= 5 && h < 18 ? "Bonjour" : "Bonsoir").append(g);
            }
            if (T.showDate) {
                String d = new SimpleDateFormat("EEEE d MMMM", Locale.FRANCE).format(now);
                if (sb.length() > 0) sb.append("  ·  ");
                sb.append(d);
            }
            dateView.setText(sb.toString());
            dateView.setVisibility(sb.length() == 0 ? View.GONE : View.VISIBLE);
        }
        if (wifiIcon != null) {
            boolean online = false;
            try {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                online = cm != null && cm.getActiveNetwork() != null;
            } catch (Exception ignored) {}
            wifiIcon.setAlpha(online ? 1f : 0.3f);
        }
    }

    // ================================================================== cycle de vie
    @Override protected void onResume() {
        super.onResume();
        ui.removeCallbacks(tick);
        ui.post(tick);
        if (appsLoaded) loadApps();
    }

    @Override protected void onPause() { super.onPause(); ui.removeCallbacks(tick); }

    @Override protected void onStart() {
        super.onStart();
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_PACKAGE_ADDED);
        f.addAction(Intent.ACTION_PACKAGE_REMOVED);
        f.addAction(Intent.ACTION_PACKAGE_CHANGED);
        f.addDataScheme("package");
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(pkgReceiver, f, Context.RECEIVER_EXPORTED);
        else registerReceiver(pkgReceiver, f);
    }

    @Override protected void onStop() {
        super.onStop();
        try { unregisterReceiver(pkgReceiver); } catch (Exception ignored) {}
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // bouton Accueil pendant qu'on est déjà dessus : on referme tout
        if (mode != 0) closeOverlay();
    }

    @Override public void onBackPressed() {
        if (mode == 3) finishIntro();
        else if (mode != 0) closeOverlay();
        // sur l'accueil, Retour ne fait rien
    }

    @Override protected void onDestroy() { super.onDestroy(); bg.shutdownNow(); ui.removeCallbacksAndMessages(null); }
}
