package schema

import (
	"encoding/json"
	"fmt"
)

type Field struct {
	Name     string `json:"name"`
	Type     string `json:"type"`     // string | email | number | boolean
	Required bool   `json:"required"`
}

func Validate(rawSchema []byte, data map[string]any) error {
	var fields []Field
	if err := json.Unmarshal(rawSchema, &fields); err != nil {
		return fmt.Errorf("invalid schema")
	}

	for _, f := range fields {
		val, exists := data[f.Name]
		if !exists || val == nil {
			if f.Required {
				return fmt.Errorf("missing required field: %s", f.Name)
			}
			continue
		}

		switch f.Type {
		case "email":
			s, ok := val.(string)
			if !ok || !isEmail(s) {
				return fmt.Errorf("invalid email: %s", f.Name)
			}
		case "number":
			switch val.(type) {
			case float64, int:
			default:
				return fmt.Errorf("expected number: %s", f.Name)
			}
		case "boolean":
			if _, ok := val.(bool); !ok {
				return fmt.Errorf("expected boolean: %s", f.Name)
			}
		}
	}
	return nil
}

func isEmail(s string) bool {
	for i, c := range s {
		if c == '@' && i > 0 && i < len(s)-1 {
			return true
		}
	}
	return false
}