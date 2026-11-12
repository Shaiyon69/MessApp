import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.shaiyon.messapp.screencapture"
    compileSdk = 36

    defaultConfig {
        minSdk = 24
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.9.0")
    // ActivityResult for the MediaProjection consent screen; tauri-android does not expose it.
    implementation("androidx.activity:activity-ktx:1.8.2")
    // Binary WebMessagePort messages carry the encoded frames and audio to the page.
    implementation("androidx.webkit:webkit:1.12.1")
    implementation(project(":tauri-android"))
}
