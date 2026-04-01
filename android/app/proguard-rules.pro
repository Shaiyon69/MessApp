# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Keep Capacitor classes
-keep class com.getcapacitor.** { *; }
-keep class com.getcapacitor.plugin.** { *; }

# Keep WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep React Native related classes (if any)
-keep class com.facebook.react.** { *; }

# Keep Supabase related classes
-keep class io.supabase.** { *; }
-keep class kotlin.** { *; }

# Keep crypto related classes for E2EE
-keep class javax.crypto.** { *; }
-keep class java.security.** { *; }

# Preserve line number information for debugging
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# Hide original source file names
-renamesourcefileattribute SourceFile

# Keep model classes
-keep class com.shaiyon.messapp.** { *; }

# Keep Gson related classes
-keepattributes Signature
-keep class com.google.gson.** { *; }
-dontwarn com.google.gson.**

# OkHttp and Retrofit
-keep class okhttp3.** { *; }
-keep class retrofit2.** { *; }
-dontwarn okhttp3.**
-dontwarn retrofit2.**
