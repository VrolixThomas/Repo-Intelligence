# PR Review Analytics Report
> Portal repository — 2024-03-13 to 2026-02-06
> Generated: 2026-02-08

## Overview
- **957** merged PRs analyzed, **6170** reviewer comments collected
- **5585** inline comments, **585** general comments
- **26** unique reviewers, **13** unique PR authors

## Top Reviewers
| Reviewer | Comments | Inline | PRs Reviewed |
|----------|----------|--------|--------------|
| Matthias De Decker | 1706 | 1619 | 241 |
| Shotallo Kato | 995 | 863 | 251 |
| Torben Gernaey | 783 | 748 | 201 |
| Tatiana Amosova | 517 | 490 | 97 |
| Lander Lichtert | 335 | 320 | 109 |
| Anthony Van Loon | 273 | 258 | 67 |
| Rune Teuwen | 221 | 212 | 57 |
| Alken Rrokaj | 208 | 196 | 44 |
| Thomas Vrolix | 206 | 200 | 61 |
| AI Code reviewer | 176 | 0 | 57 |
| James Abrahamson | 152 | 143 | 63 |
| William Vanden Daele | 129 | 119 | 39 |
| Oleh Prostakov | 128 | 125 | 49 |
| bianca rafaela sehn | 97 | 86 | 50 |
| Ralph Krauss | 70 | 53 | 24 |

## Most-Commented Projects
| Project | Comments | Reviewers | PRs |
|---------|----------|-----------|-----|
| Portal.Services.V2 | 1369 | 19 | 315 |
| Portal.Core | 1119 | 19 | 290 |
| root | 858 | 26 | 422 |
| BackOffice.Web | 258 | 17 | 87 |
| Portal.Services | 237 | 16 | 89 |
| Portal.Migrations | 234 | 17 | 105 |
| Portal.Services.IntegrationTests | 220 | 14 | 113 |
| BackOffice.Web.Tests.Integration | 210 | 14 | 62 |
| Reporting.Core | 185 | 10 | 56 |
| solution | 151 | 9 | 25 |
| BackOffice.WebClient | 131 | 15 | 70 |
| BackOffice.Regulators.ServiceHost | 106 | 10 | 32 |
| Portal.Web | 100 | 12 | 51 |
| Portal.ServiceIntegrations.Web | 86 | 12 | 38 |
| Backoffice.ApiTests | 75 | 13 | 38 |
| BackOffice.JobService.ServiceHost | 73 | 14 | 38 |
| Portal.Common.V2 | 70 | 11 | 32 |
| Portal.UnitTests | 63 | 13 | 37 |
| ServiceIntegrations.Web | 62 | 8 | 12 |
| Backoffice.ApiContracts | 55 | 9 | 34 |

## Hotspot Files (Top 20)
Files that consistently attract review feedback.
| File | Comments | PRs | Reviewers |
|------|----------|-----|-----------|
| src/Portal/Directory.Packages.props | 106 | 3 | 1 |
| swagger/BackofficeAPI/Green-Island-Backoffice-SharedDomain.yaml | 102 | 50 | 15 |
| swagger/PortalAPI/PortalAPI.yaml | 76 | 44 | 14 |
| src/Portal/Portal.Services.V2/RequestHandlers/Command/CDB/DGOJ/Projections/UpdateGamingActivityProjectionRequestHandler.cs | 45 | 1 | 4 |
| swagger/BackofficeAPI/Green-Island-BackOffice-AggregateApi.yaml | 38 | 24 | 8 |
| src/Portal/Portal.ServiceIntegrations.Web/Controllers/GameSportProviderController.cs | 33 | 11 | 6 |
| src/Portal/Portal.Core/Domain/Models/Sports/Reconciliation/CurrentSportsBetState.Methods.cs | 32 | 4 | 4 |
| src/Portal/Portal.Services/RequestHandlers/Command/CDB/KSA/Docaposte/Bets/SendBetsXakRequestHandler.cs | 30 | 2 | 2 |
| src/Portal/BackOffice.Web/ApiContracts/BackOfficeAPI.cs | 26 | 19 | 10 |
| src/Portal/Portal.Services.V2/RequestHandlers/Command/CDB/DGOJ/ProcessContrapartyBetTotalRecordRequestHandler.cs | 24 | 2 | 4 |
| tf/alb/terraform.tfvars | 24 | 17 | 8 |
| src/Portal/Portal.Services.V2/Helpers/Converters/CDB/DGOJ/OtherGamesTotalConverters.cs | 23 | 1 | 3 |
| src/Portal/Portal.Services.V2/Services/External/Docaposte/DGOJRecordService/DGOJRecordService.cs | 22 | 4 | 6 |
| src/Portal/Portal.Services.V2/Helpers/Converters/CDB/DGOJ/PlayerAccountDetailsConverters.cs | 21 | 6 | 3 |
| src/Portal/Portal.Services.V2/RequestHandlers/Command/CDB/DGOJ/SendDailySportsEventDataExportRequestHandler.cs | 19 | 2 | 3 |
| src/Portal/Portal.Services.V2/RequestHandlers/Command/CDB/KSA/Docaposte/GameSessions/ProcessGameSessionsForXakProjectionRequestHandler.cs | 19 | 5 | 2 |
| src/Portal/Portal.Core/Domain/Models/Sports/Boosted/BoostedAccount.cs | 19 | 4 | 4 |
| src/Portal/Portal.Services.V2/RequestHandlers/Command/CDB/KSA/Docaposte/PlayerProfiles/SendBatchedPlayerProfilesRequestHandler.cs | 18 | 3 | 4 |
| src/Portal/Portal.Games.IntegrationTests/Evolution/PromoPayoutTests.cs | 18 | 1 | 1 |
| src/Portal/BackOffice.JobService.ServiceHost/Scheduler.cs | 17 | 10 | 8 |

## Comment Categories
What reviewers comment on most.
| Category | Count | % | Examples |
|----------|-------|---|----------|
| Other | 3346 | 54% | "I think removing those should be also done from the configuration table, this is why they are still", "you can mark this one as obsolete as well", "and this one" |
| Logic | 1600 | 26% | "but it’s not event identifier, it’s bet part identifier? For eventId you need to have    ProviderSer", "think we have statuses for the rest of staged bet-related records, so it’s uniform with those", "I also see events   SportsBetDetailsUpdated - not sure if there are any changes for the fields which" |
| Error Handling | 755 | 12% | "I would just handle this in the converter. \(see my comment there\)", "I am not a fan of using RequestHandler, as it’s the BetAdjustmentStagingProjection", "Can we try doing 1 query per user, but make use of the Future-functionality of NHibernate?" |
| Testing | 666 | 11% | "I’m confused why you are doing cleanup in the tests here :cry:    Especially **DocaposteRecordsCheck", "Can you cleanup this test/fix the setup as now it is a bit unclear as to what is happening and why.", "There’s a bug, it’s generating the same file twice, for all of the changes \(except preview, althoug" |
| Naming | 510 | 8% | "but it’s not event identifier, it’s bet part identifier? For eventId you need to have    ProviderSer", "Same question here, no fallback for `GameProviderTournamentUndoRegister`", "Question: Are we sure it is correct to add it to the last active gamingsession? Because maybe someth" |
| Documentation | 404 | 7% | "I would just handle this in the converter. \(see my comment there\)", "I’m confused why you are doing cleanup in the tests here :cry:    Especially **DocaposteRecordsCheck", "shouldn’t the document number be provided here?" |
| Architecture | 351 | 6% | "but it’s not event identifier, it’s bet part identifier? For eventId you need to have    ProviderSer", "```         public static BetPart ConvertToDomainObject(this ProviderService.ApiContracts.Portal2Gam", "We expect error code to correspond to the EGenericErrorReason model even though it’s mapped here in" |
| Code Style | 295 | 5% | "I’m confused why you are doing cleanup in the tests here :cry:    Especially **DocaposteRecordsCheck", "Can you cleanup this test/fix the setup as now it is a bit unclear as to what is happening and why.", "Type you can choose. Either leave it empty or you could refactor the `ProcessTransactions` code a bi" |
| Performance | 255 | 4% | "I feel like these exceptions can be catched and handled inside `SendAsyncVeridasApi`", "you can just await this if you make the setup async", "I think this code can be optimized:  1. the redshift calls do not need to happen within the sql-serv" |
| Security | 143 | 2% | "Don’t we need something like this for the enum?   `Map(x => x.TokenType).CustomType<GenericEnumMappe", "@{6405a6f70a4a47fb8d230947}  Apparently for customizing text, styles, and components, we need to sen", "if you want this check everywhere, you can do something similar as we have for the AuthenticatedTest" |

## Review Patterns
Who reviews whom (top 15 pairs).
| Reviewer | Author | Comments |
|----------|--------|----------|
| Matthias De Decker | Shotallo Kato | 356 |
| Matthias De Decker | James Abrahamson | 336 |
| Tatiana Amosova | Alken Rrokaj | 190 |
| Matthias De Decker | William Vanden Daele | 163 |
| Shotallo Kato | Steven Huygens | 153 |
| Shotallo Kato | bianca rafaela sehn | 148 |
| Matthias De Decker | Oleh Prostakov | 142 |
| Shotallo Kato | Lander Lichtert | 137 |
| Matthias De Decker | Torben Gernaey | 130 |
| Torben Gernaey | Lander Lichtert | 130 |
| Torben Gernaey | Rune Teuwen | 116 |
| Shotallo Kato | Anthony Van Loon | 116 |
| Tatiana Amosova | Viktor Gakis | 115 |
| Matthias De Decker | Alken Rrokaj | 110 |
| Matthias De Decker | Thomas Vrolix | 108 |

## Monthly Trend
| Month | PRs | Comments | Avg Comments/PR |
|-------|-----|----------|-----------------|
| 2024-03 | 1 | 1 | 1 |
| 2024-06 | 3 | 10 | 3.3 |
| 2024-08 | 1 | 8 | 8 |
| 2024-09 | 3 | 12 | 4 |
| 2024-10 | 1 | 5 | 5 |
| 2024-12 | 2 | 10 | 5 |
| 2025-01 | 3 | 9 | 3 |
| 2025-02 | 64 | 324 | 5.1 |
| 2025-03 | 73 | 292 | 4 |
| 2025-04 | 80 | 461 | 5.8 |
| 2025-05 | 97 | 488 | 5 |
| 2025-06 | 81 | 434 | 5.4 |
| 2025-07 | 135 | 742 | 5.5 |
| 2025-08 | 86 | 530 | 6.2 |
| 2025-09 | 90 | 677 | 7.5 |
| 2025-10 | 85 | 496 | 5.8 |
| 2025-11 | 71 | 381 | 5.4 |
| 2025-12 | 71 | 543 | 7.6 |
| 2026-01 | 92 | 571 | 6.2 |
| 2026-02 | 38 | 176 | 4.6 |

## Inline vs General by Project
| Project | Inline | General |
|---------|--------|---------|
| Portal.Services.V2 | 1369 | 0 |
| Portal.Core | 1119 | 0 |
| root | 273 | 585 |
| BackOffice.Web | 258 | 0 |
| Portal.Services | 237 | 0 |
| Portal.Migrations | 234 | 0 |
| Portal.Services.IntegrationTests | 220 | 0 |
| BackOffice.Web.Tests.Integration | 210 | 0 |
| Reporting.Core | 185 | 0 |
| solution | 151 | 0 |
| BackOffice.WebClient | 131 | 0 |
| BackOffice.Regulators.ServiceHost | 106 | 0 |
| Portal.Web | 100 | 0 |
| Portal.ServiceIntegrations.Web | 86 | 0 |
| Backoffice.ApiTests | 75 | 0 |
| BackOffice.JobService.ServiceHost | 73 | 0 |
| Portal.Common.V2 | 70 | 0 |
| Portal.UnitTests | 63 | 0 |
| ServiceIntegrations.Web | 62 | 0 |
| Backoffice.ApiContracts | 55 | 0 |
