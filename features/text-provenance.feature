Feature: bounded text provenance sanitation

  Scenario: explicitly approved non-semantic controls are removed with evidence
    Given a draft containing an ASCII bell and a mid-document byte-order mark
    And the minimal hidden-text policy approves those removals
    When HYV applies the policy
    Then only those two code points are removed
    And HYV returns exact offsets, input hash, output hash, and an idempotence result

  Scenario: multilingual and structured text is review-only by default
    Given a draft containing Arabic bidi controls, Indic joiners, emoji joiners, Markdown, and tabs
    When HYV inspects hidden text
    Then the draft is not changed
    And every ambiguous control is a review finding
    And HYV does not call the finding a watermark

Feature: meaning-first recomposition transport

  Scenario: an external writer receives no source prose
    Given an authorized meaning-first rebuild task
    When HYV creates a writer request
    Then the request contains the structured writing prompt and task binding
    And it does not contain the source draft, capability, or profile body

  Scenario: unknown provider status remains explicit
    Given a meaning-first rebuild candidate with no matching verifier
    When HYV evaluates the candidate
    Then provenance status is unknown
    And HYV does not claim watermark removal or absence

  Scenario: a controlled verifier is not configured
    Given a rebuild task without a matching same-scheme verifier
    When HYV creates evidence
    Then the provenance result is not configured or unknown
    And lexical residual is not used as a provider verifier
