package com.p2pcfrn

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = P2pcfRnModule.NAME)
class P2pcfRnModule(reactContext: ReactApplicationContext) :
  NativeP2pcfRnSpec(reactContext) {

  override fun getName(): String {
    return NAME
  }

  // Example method
  // See https://reactnative.dev/docs/native-modules-android
  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = "P2pcfRn"
  }
}
