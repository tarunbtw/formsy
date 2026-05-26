package mailer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

type emailPayload struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	Html    string   `json:"html"`
}

func SendSubmissionAlert(toEmail, projectName, projectID string, data map[string]any) error {
	body, _ := json.MarshalIndent(data, "", "  ")

	html := fmt.Sprintf(`
		<h2>New submission on <strong>%s</strong></h2>
		<p>You got a new form submission on Formsy.</p>
		<pre style="background:#f4f4f4;padding:12px;border-radius:6px;">%s</pre>
		<p><a href="https://formsy.dev/dashboard/%s">View in dashboard →</a></p>
	`, projectName, string(body), projectID)

	payload := emailPayload{
		From:    "Formsy <onboarding@resend.dev>",
		To:      []string{toEmail},
		Subject: fmt.Sprintf("New submission on %s", projectName),
		Html:    html,
	}

	jsonBody, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewBuffer(jsonBody))
	req.Header.Set("Authorization", "Bearer "+os.Getenv("RESEND_API_KEY"))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("resend error: %d", resp.StatusCode)
	}
	return nil
}