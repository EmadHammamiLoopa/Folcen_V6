package com.folcen.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.util.Log;
import android.webkit.PermissionRequest;

import androidx.core.content.ContextCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

import java.util.Arrays;
import java.util.List;

public class FolcenWebChromeClient extends BridgeWebChromeClient {
    private static final String TAG = "FolcenWebChrome";
    private final Bridge bridge;

    public FolcenWebChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        Log.d(TAG, "WebView permission requested " + Arrays.toString(request != null ? request.getResources() : null));
        if (canGrantMediaRequest(request)) {
            Log.d(TAG, "Auto-granting WebView media permission " + Arrays.toString(request.getResources()));
            request.grant(request.getResources());
            return;
        }

        super.onPermissionRequest(request);
    }

    private boolean canGrantMediaRequest(PermissionRequest request) {
        if (request == null || bridge == null || bridge.getActivity() == null) return false;
        List<String> resources = Arrays.asList(request.getResources());
        boolean video = resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE) || hasResource(resources, "VIDEO_CAPTURE");
        boolean audio = resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) || hasResource(resources, "AUDIO_CAPTURE");
        if (!video && !audio) return false;

        boolean hasCamera = ContextCompat.checkSelfPermission(
                bridge.getActivity(),
                Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED;
        boolean hasAudio = ContextCompat.checkSelfPermission(
                bridge.getActivity(),
                Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED;
        Log.d(TAG, "Granting WebView media origin request; runtime camera=" + hasCamera + " audio=" + hasAudio);

        return true;
    }

    private boolean hasResource(List<String> resources, String needle) {
        for (String resource : resources) {
            if (resource != null && resource.toUpperCase().contains(needle)) return true;
        }
        return false;
    }
}
