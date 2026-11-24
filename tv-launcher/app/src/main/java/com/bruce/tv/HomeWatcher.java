package com.bruce.tv;

import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;

/**
 * Bouton Accueil → Bruce TV, sans rien désactiver.
 * Quand l'écran d'accueil Google TV s'ouvre (bouton Home, démarrage de la clé…), on affiche Bruce TV à la place.
 * L'accueil Google TV reste installé et actif : la touche ⚙, la recherche vocale et les réglages rapides marchent toujours.
 * Ne lit jamais le contenu de l'écran (canRetrieveWindowContent = false) : seulement le nom de l'appli qui s'ouvre.
 */
public class HomeWatcher extends AccessibilityService {

    static final String[] STOCK_HOMES = {
            "com.google.android.apps.tv.launcherx", "com.google.android.tvlauncher", "com.google.android.leanbacklauncher"
    };
    // fenêtres de l'accueil Google TV qu'on ne remplace jamais (réglages rapides, recherche, profils…)
    private static final String[] KEEP = {"dashboard", "setting", "search", "profile", "account", "input", "notification",
            "assistant", "voice", "panel", "dialog", "picker", "onboard", "setup", "update", "ambient"};

    private long lastLaunch = 0;
    private long homeDownAt = 0;
    private final Handler ui = new Handler(Looper.getMainLooper());

    /** au démarrage de la clé : on affiche Bruce TV dès que le service est prêt */
    @Override protected void onServiceConnected() {
        super.onServiceConnected();
        if (SystemClock.elapsedRealtime() < 5 * 60 * 1000 && overrideOn()) {
            ui.postDelayed(this::openBruce, 1200);
            ui.postDelayed(this::openBruce, 4000);   // au cas où l'accueil Google TV repasse devant pendant le démarrage
        }
    }

    /** appui court sur Accueil → Bruce TV, même si l'accueil Google TV est déjà affiché.
     *  On ne bloque pas la touche : l'appui long (panneau de réglages rapides) marche toujours. */
    @Override protected boolean onKeyEvent(KeyEvent e) {
        if (e.getKeyCode() != KeyEvent.KEYCODE_HOME) return false;
        if (e.getAction() == KeyEvent.ACTION_DOWN) { if (e.getRepeatCount() == 0) homeDownAt = SystemClock.uptimeMillis(); }
        else if (e.getAction() == KeyEvent.ACTION_UP && SystemClock.uptimeMillis() - homeDownAt < 600) {
            SharedPreferences p = getSharedPreferences("bruce_tv", MODE_PRIVATE);
            if (p.getBoolean("home_override", true)) {
                p.edit().putBoolean("stock_mode", false).apply();
                ui.postDelayed(this::openBruce, 180);
            }
        }
        return false;
    }

    private boolean overrideOn() {
        SharedPreferences p = getSharedPreferences("bruce_tv", MODE_PRIVATE);
        return p.getBoolean("home_override", true) && !p.getBoolean("stock_mode", false);
    }

    private void openBruce() {
        lastLaunch = SystemClock.uptimeMillis();
        Intent i = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        try { startActivity(i); } catch (Exception ignored) {}
    }

    static boolean isStockHome(String pkg) {
        for (String p : STOCK_HOMES) if (p.equals(pkg)) return true;
        return false;
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent e) {
        if (e == null || e.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence pk = e.getPackageName(), cl = e.getClassName();
        if (pk == null) return;
        String pkg = pk.toString(), cls = cl == null ? "" : cl.toString();
        SharedPreferences p = getSharedPreferences("bruce_tv", MODE_PRIVATE);

        if (!isStockHome(pkg)) {
            // on a quitté l'accueil Google TV vers une vraie appli : fin du « mode Google TV » demandé depuis Bruce TV
            if (!pkg.equals(getPackageName()) && !pkg.equals("com.android.systemui") && !pkg.startsWith("android")
                    && p.getBoolean("stock_mode", false) && isActivity(pkg, cls)) {
                p.edit().putBoolean("stock_mode", false).apply();
            }
            return;
        }
        if (!p.getBoolean("home_override", true) || p.getBoolean("stock_mode", false)) return;
        if (!isActivity(pkg, cls)) return;                 // un panneau / une superposition, pas l'écran d'accueil
        String low = cls.toLowerCase();
        for (String k : KEEP) if (low.contains(k)) return;

        if (SystemClock.uptimeMillis() - lastLaunch < 500) return;
        openBruce();
    }

    private boolean isActivity(String pkg, String cls) {
        if (cls.isEmpty() || !cls.contains(".")) return false;
        try {
            getPackageManager().getActivityInfo(new ComponentName(pkg, cls), 0);
            return true;
        } catch (PackageManager.NameNotFoundException ex) {
            return false;
        } catch (Exception ex) {
            return false;
        }
    }

    @Override public void onInterrupt() {}
}
