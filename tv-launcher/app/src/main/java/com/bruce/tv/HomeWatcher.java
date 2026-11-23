package com.bruce.tv;

import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.SystemClock;
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

        long now = SystemClock.uptimeMillis();
        if (now - lastLaunch < 500) return;
        lastLaunch = now;
        Intent i = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        try { startActivity(i); } catch (Exception ignored) {}
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
