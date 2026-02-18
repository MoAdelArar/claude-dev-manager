package com.adelbot.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val AdelPrimary = Color(0xFF6C63FF)
val AdelPrimaryDark = Color(0xFF5A52D5)
val AdelSecondary = Color(0xFF03DAC6)
val AdelBackground = Color(0xFF0D1117)
val AdelSurface = Color(0xFF161B22)
val AdelSurfaceVariant = Color(0xFF21262D)
val AdelOnBackground = Color(0xFFC9D1D9)
val AdelOnSurface = Color(0xFFC9D1D9)
val AdelError = Color(0xFFF85149)
val AdelSuccess = Color(0xFF3FB950)
val AdelWarning = Color(0xFFD29922)
val AdelOnPrimary = Color(0xFFFFFFFF)

private val DarkColorScheme = darkColorScheme(
    primary = AdelPrimary,
    onPrimary = AdelOnPrimary,
    secondary = AdelSecondary,
    background = AdelBackground,
    surface = AdelSurface,
    surfaceVariant = AdelSurfaceVariant,
    onBackground = AdelOnBackground,
    onSurface = AdelOnSurface,
    error = AdelError,
)

private val LightColorScheme = lightColorScheme(
    primary = AdelPrimary,
    onPrimary = Color.White,
    secondary = AdelSecondary,
    background = Color(0xFFF6F8FA),
    surface = Color.White,
    surfaceVariant = Color(0xFFEEF0F2),
    onBackground = Color(0xFF24292F),
    onSurface = Color(0xFF24292F),
    error = Color(0xFFCF222E),
)

val AdelBotTypography = Typography(
    headlineLarge = TextStyle(
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        lineHeight = 36.sp,
    ),
    headlineMedium = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 22.sp,
        lineHeight = 28.sp,
    ),
    titleLarge = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
        lineHeight = 24.sp,
    ),
    titleMedium = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        lineHeight = 22.sp,
    ),
    bodyLarge = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    ),
    bodyMedium = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    bodySmall = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 16.sp,
    ),
    labelLarge = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    ),
)

@Composable
fun AdelBotTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context)
            else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = AdelBotTypography,
        content = content
    )
}
