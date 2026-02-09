# PR Review Analytics Report
> Portal repository — 2024-07-31 to 2026-02-05
> Generated: 2026-02-08

## Overview
- **171** merged PRs analyzed, **1773** reviewer comments collected
- **1694** inline comments, **79** general comments
- **10** unique reviewers, **5** unique PR authors

## Top Reviewers
| Reviewer | Comments | Inline | PRs Reviewed |
|----------|----------|--------|--------------|
| Alken Rrokaj | 696 | 664 | 81 |
| Viktor Gakis | 440 | 427 | 72 |
| Tatiana Amosova | 370 | 347 | 81 |
| Thomas Vrolix | 194 | 188 | 54 |
| Oleh Prostakov | 45 | 43 | 9 |
| Matthias De Decker | 11 | 11 | 2 |
| Shotallo Kato | 8 | 6 | 2 |
| Bert Bellen | 4 | 4 | 2 |
| Benjamin Nicodeme | 4 | 3 | 1 |
| Kateryna Danylenko | 1 | 1 | 1 |

## Most-Commented Projects
| Project | Comments | Reviewers | PRs |
|---------|----------|-----------|-----|
| ProviderService.Services | 378 | 6 | 67 |
| ProviderService.ApiClients | 289 | 5 | 54 |
| ProviderService | 216 | 6 | 58 |
| ProviderService.BLL | 205 | 8 | 60 |
| root | 93 | 8 | 60 |
| ProviderService.Infrastructure | 84 | 6 | 26 |
| ProviderService | 75 | 5 | 17 |
| ProviderService.ExternalApiContracts | 73 | 4 | 28 |
| PlaynGo.IntegrationTests | 73 | 3 | 9 |
| PlaynGo.UnitTests | 40 | 3 | 13 |
| V3.UnitTests | 34 | 5 | 17 |
| Portal.IntegrationTests | 22 | 4 | 13 |
| V3.TestFixtures | 19 | 4 | 8 |
| V3.IntegrationTests | 17 | 3 | 8 |
| Egt.IntegrationTests | 15 | 2 | 6 |
| ProviderService.ApiContracts | 13 | 4 | 10 |
| ProviderService.DataImporter | 13 | 5 | 7 |
| ProviderService.Tests | 10 | 4 | 7 |
| ProviderService.JobSvc | 10 | 4 | 3 |
| Playtech.UnitTests | 8 | 2 | 2 |

## Hotspot Files (Top 20)
Files that consistently attract review feedback.
| File | Comments | PRs | Reviewers |
|------|----------|-----|-----------|
| ProviderService/ProviderService/Controllers/Providers/Games/PlaynGo/PlaynGoController.cs | 49 | 6 | 2 |
| ProviderService/ProviderService.Services/Handlers/Providers/Games/PlaynGo/RequestHandlers/PlaynGoAuthenticateRequestHandler.cs | 29 | 4 | 3 |
| ProviderService/ProviderService/Controllers/Providers/Games/RedPanda/RedPandaController.cs | 22 | 3 | 4 |
| ProviderService/ProviderService.ApiClients/Providers/Games/Playtech/PlaytechFreeSpinsRequestManager.cs | 21 | 3 | 3 |
| ProviderService/ProviderService/Program.cs | 19 | 12 | 3 |
| ProviderService/ProviderService.Services/Handlers/Providers/Games/Common/Handlers/GameProviderCreditHandler.cs | 17 | 6 | 4 |
| ProviderService/ProviderService.ApiClients/Providers/Games/Synot/SynotRequestManager.cs | 16 | 1 | 2 |
| ProviderService/ProviderService.Services/Handlers/Providers/Games/Playtech/PlaytechCreditRequestHandler.cs | 15 | 4 | 4 |
| ProviderService/ProviderService.BLL/Services/Providers/Games/PlaynGo/PlaynGoTokenService.cs | 15 | 4 | 4 |
| ProviderService/ProviderService/Controllers/Providers/Games/Egt/EgtController.cs | 14 | 5 | 3 |
| ProviderService/ProviderService/Controllers/Providers/Games/Yggdrasil/YggdrasilController.cs | 13 | 3 | 3 |
| ProviderService/ProviderService.ApiClients/Providers/Games/Playson/PlaysonGetGameUrlRequestManager.cs | 13 | 1 | 2 |
| ProviderService/ProviderService.ApiClients/Providers/Games/PlaynGo/PlaynGoGetGameUrlRequestManager.cs | 13 | 4 | 2 |
| ProviderService/ProviderService.Services/Handlers/Providers/Games/PlaynGo/RequestHandlers/PlaynGoCreditRequestHandler.cs | 12 | 2 | 3 |
| ProviderService/PlaynGo.IntegrationTests/EndToEndTests/CreditIntegrationTests.cs | 11 | 3 | 2 |
| ProviderService/PlaynGo.IntegrationTests/EndToEndTests/CancelIntegrationTests.cs | 11 | 2 | 2 |
| ProviderService/ProviderService.ApiClients/Providers/Games/EGT/EgtFreeSpinsRequestManager.cs | 10 | 1 | 2 |
| ProviderService/ProviderService.ApiClients/Portal/Services/PortalService.cs | 10 | 3 | 4 |
| scripts/migration_cleanup.sql | 10 | 1 | 3 |
| ProviderService/ProviderService.BLL/Domain/Common/Enums/Error.cs | 10 | 4 | 3 |

## Comment Categories
What reviewers comment on most.
| Category | Count | % | Examples |
|----------|-------|---|----------|
| Other | 860 | 49% | "Is this the actual secret key? :sweat_smile:   ‌", "Not used", "did we agree with Yggdrasil to send empty balance instead of actual balance in the end?" |
| Logic | 412 | 23% | "how does this differ from the base one?", "please inherit from the base BarbaraBangProviderTestFixture and remove the public ProviderCode Provi", "A fixed timestamp is actually preferred, so just freeze it or something at a fixed time instead of u" |
| Error Handling | 230 | 13% | "```csharp     public bool HasTombstoneCreditHandler => true;     public bool HasTombstoneDebitHandle", "Please recheck this flow as you have dual portal mocks being setup. You should extend  ```csharp Set", "Why isn't description an enum from the get go when it is deserialized? this should not be a handler" |
| Testing | 215 | 12% | "Please recheck this flow as you have dual portal mocks being setup. You should extend  ```csharp Set", "please use TestConstants for the balance here and in general everywhere for tests", "not entirely sure I understand what is going on here but eventually you are asserting for final getg" |
| Security | 140 | 8% | "IGameProviderTokenRepository", "IGameProviderTokenRepository", "i’m confused, so you don’t need auth here?" |
| Naming | 128 | 7% | "Why isn't description an enum from the get go when it is deserialized? this should not be a handler", "Insane nit, but would also be using **\{nameof\(ProviderCode.NextGen\)\}** here just in case", "**insane nit again \{nameof\(ProviderCode.NextGen\)\}**" |
| Architecture | 119 | 7% | "Please recheck this flow as you have dual portal mocks being setup. You should extend  ```csharp Set", "please check my comment on ProviderService.ExternalApiContracts/Providers/Games/Yggdrasil/YggdrasilC", "we never used tournaments in provider service, right? can’t we just remove this one?" |
| Documentation | 94 | 5% | "please check my comment on ProviderService.ExternalApiContracts/Providers/Games/Yggdrasil/YggdrasilC", "Approved but please do @{712020:9e96ac81-8d75-4dd8-a7c2-79ca923f5288} his comments  ‌", "same comment as in the portal, maybe about time we remove ts" |
| Performance | 60 | 3% | "this does not have to be async at all, probably just a relic from the base handler", "agreed, its just a one liner too  ``` var userDetails = await _portalService.GetAccountDetailsForGam", "The logic seems a bit repetitive-weird here. I would do something like  ```csharp if (tokenDb is nul" |
| Code Style | 50 | 3% | "For now this is fine as its a hotfix, i wouldnt make the change rn.", "please clean up the TxRepositories setting up the txType now like in PlayngoTxRepository / HacksawTx", "is this method still used? if so, please refactor to use your new method with txtype win and check w" |

## Review Patterns
Who reviews whom (top 15 pairs).
| Reviewer | Author | Comments |
|----------|--------|----------|
| Alken Rrokaj | Thomas Vrolix | 318 |
| Alken Rrokaj | Viktor Gakis | 293 |
| Viktor Gakis | Thomas Vrolix | 176 |
| Tatiana Amosova | Viktor Gakis | 162 |
| Viktor Gakis | Alken Rrokaj | 129 |
| Viktor Gakis | Kateryna Danylenko | 97 |
| Tatiana Amosova | Alken Rrokaj | 94 |
| Thomas Vrolix | Viktor Gakis | 84 |
| Tatiana Amosova | Thomas Vrolix | 77 |
| Thomas Vrolix | Alken Rrokaj | 53 |
| Alken Rrokaj | Kateryna Danylenko | 48 |
| Thomas Vrolix | Kateryna Danylenko | 45 |
| Alken Rrokaj | Tatiana Amosova | 36 |
| Tatiana Amosova | Kateryna Danylenko | 33 |
| Viktor Gakis | Tatiana Amosova | 24 |

## Monthly Trend
| Month | PRs | Comments | Avg Comments/PR |
|-------|-----|----------|-----------------|
| 2024-07 | 1 | 2 | 2 |
| 2024-11 | 1 | 25 | 25 |
| 2024-12 | 1 | 11 | 11 |
| 2025-01 | 1 | 1 | 1 |
| 2025-02 | 16 | 112 | 7 |
| 2025-03 | 11 | 85 | 7.7 |
| 2025-04 | 13 | 100 | 7.7 |
| 2025-05 | 12 | 46 | 3.8 |
| 2025-06 | 11 | 150 | 13.6 |
| 2025-07 | 17 | 295 | 17.4 |
| 2025-08 | 18 | 107 | 5.9 |
| 2025-09 | 11 | 116 | 10.5 |
| 2025-10 | 18 | 277 | 15.4 |
| 2025-11 | 19 | 186 | 9.8 |
| 2025-12 | 13 | 89 | 6.8 |
| 2026-01 | 18 | 132 | 7.3 |
| 2026-02 | 6 | 39 | 6.5 |

## Inline vs General by Project
| Project | Inline | General |
|---------|--------|---------|
| ProviderService.Services | 378 | 0 |
| ProviderService.ApiClients | 289 | 0 |
| ProviderService | 216 | 0 |
| ProviderService.BLL | 205 | 0 |
| root | 14 | 79 |
| ProviderService.Infrastructure | 84 | 0 |
| ProviderService | 75 | 0 |
| ProviderService.ExternalApiContracts | 73 | 0 |
| PlaynGo.IntegrationTests | 73 | 0 |
| PlaynGo.UnitTests | 40 | 0 |
| V3.UnitTests | 34 | 0 |
| Portal.IntegrationTests | 22 | 0 |
| V3.TestFixtures | 19 | 0 |
| V3.IntegrationTests | 17 | 0 |
| Egt.IntegrationTests | 15 | 0 |
| ProviderService.ApiContracts | 13 | 0 |
| ProviderService.DataImporter | 13 | 0 |
| ProviderService.Tests | 10 | 0 |
| ProviderService.JobSvc | 10 | 0 |
| Playtech.UnitTests | 8 | 0 |
