package com.adelbot.data.repository

import com.adelbot.data.api.AdelBotApi
import com.adelbot.data.model.Branch
import com.adelbot.data.model.Repository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RepoRepository @Inject constructor(
    private val api: AdelBotApi
) {
    suspend fun getRepositories(): List<Repository> = api.getRepositories()

    suspend fun syncRepositories(): List<Repository> = api.syncRepositories()

    suspend fun getRepository(repoId: String): Repository = api.getRepository(repoId)

    suspend fun getBranches(repoId: String): List<Branch> = api.getBranches(repoId)
}
