package com.adelbot.util

import com.adelbot.BuildConfig
import com.adelbot.data.model.WebSocketEvent
import com.google.gson.Gson
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import org.java_websocket.client.WebSocketClient as WSClient
import org.java_websocket.handshake.ServerHandshake
import java.net.URI

class SessionWebSocketClient(
    private val sessionId: String,
    private val token: String
) {
    private var client: WSClient? = null
    private val _events = Channel<WebSocketEvent>(Channel.BUFFERED)
    val events: Flow<WebSocketEvent> = _events.receiveAsFlow()

    private val gson = Gson()
    private var isConnected = false

    fun connect() {
        val baseUrl = BuildConfig.API_BASE_URL
            .replace("http://", "ws://")
            .replace("https://", "wss://")
        val uri = URI("$baseUrl/api/v1/ws/session/$sessionId?token=$token")

        client = object : WSClient(uri) {
            override fun onOpen(handshakedata: ServerHandshake?) {
                isConnected = true
                _events.trySend(
                    WebSocketEvent(type = "connected", content = "Connected to session")
                )
            }

            override fun onMessage(message: String?) {
                message?.let {
                    try {
                        val event = gson.fromJson(it, WebSocketEvent::class.java)
                        _events.trySend(event)
                    } catch (e: Exception) {
                        _events.trySend(
                            WebSocketEvent(type = "error", content = "Parse error: ${e.message}")
                        )
                    }
                }
            }

            override fun onClose(code: Int, reason: String?, remote: Boolean) {
                isConnected = false
                _events.trySend(
                    WebSocketEvent(type = "disconnected", content = reason ?: "Connection closed")
                )
            }

            override fun onError(ex: Exception?) {
                _events.trySend(
                    WebSocketEvent(type = "error", content = ex?.message ?: "Unknown error")
                )
            }
        }

        client?.connect()
    }

    fun sendPing() {
        if (isConnected) {
            client?.send(gson.toJson(mapOf("type" to "ping")))
        }
    }

    fun requestStatus() {
        if (isConnected) {
            client?.send(gson.toJson(mapOf("type" to "get_status")))
        }
    }

    fun disconnect() {
        isConnected = false
        client?.close()
        _events.close()
    }
}
