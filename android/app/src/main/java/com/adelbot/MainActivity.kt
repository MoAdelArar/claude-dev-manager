package com.adelbot

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.adelbot.ui.navigation.AdelBotNavHost
import com.adelbot.ui.theme.AdelBotTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        handleGitHubCallback(intent)

        setContent {
            AdelBotTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    AdelBotNavHost()
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleGitHubCallback(intent)
    }

    private fun handleGitHubCallback(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme == "adelbot" && uri.host == "callback") {
            val code = uri.getQueryParameter("code")
            if (code != null) {
                GitHubCallbackHolder.code = code
            }
        }
    }
}

object GitHubCallbackHolder {
    var code: String? = null
}
