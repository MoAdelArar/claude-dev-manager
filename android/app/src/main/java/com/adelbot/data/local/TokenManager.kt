package com.adelbot.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "adelbot_prefs")

@Singleton
class TokenManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private val ACCESS_TOKEN = stringPreferencesKey("access_token")
        private val USER_ID = stringPreferencesKey("user_id")
        private val USERNAME = stringPreferencesKey("username")
        private val AVATAR_URL = stringPreferencesKey("avatar_url")
    }

    val accessToken: Flow<String?> = context.dataStore.data.map { it[ACCESS_TOKEN] }
    val userId: Flow<String?> = context.dataStore.data.map { it[USER_ID] }
    val username: Flow<String?> = context.dataStore.data.map { it[USERNAME] }
    val avatarUrl: Flow<String?> = context.dataStore.data.map { it[AVATAR_URL] }

    suspend fun getAccessToken(): String? = accessToken.first()

    suspend fun saveAuthData(token: String, userId: String, username: String, avatarUrl: String?) {
        context.dataStore.edit { prefs ->
            prefs[ACCESS_TOKEN] = token
            prefs[USER_ID] = userId
            prefs[USERNAME] = username
            avatarUrl?.let { prefs[AVATAR_URL] = it }
        }
    }

    suspend fun clearAuthData() {
        context.dataStore.edit { it.clear() }
    }

    suspend fun isLoggedIn(): Boolean = getAccessToken() != null
}
