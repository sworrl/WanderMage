// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.serialization) apply false // For Ktor/Retrofit and data parsing
    alias(libs.plugins.ksp) apply false // For Room
}
buildscript {
    repositories {
        google()
        mavenCentral()
    }
}
