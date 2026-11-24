package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

var allowedExtensions = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".webp": true,
	".gif":  true,
	".svg":  true,
}

// UploadImage handles image uploads and saves them into the persistent volume directory.
// POST /api/upload
// Accepts form-data with field name "file" or "image"
func (h *AppHandler) UploadImage(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		file, err = c.FormFile("image")
	}
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "يرجى تحديد ملف الصورة للرفع"})
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !allowedExtensions[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "نوع الملف غير مدعوم، يرجى رفع صورة (PNG, JPG, WEBP, GIF, SVG)"})
		return
	}

	// Determine upload directory (defaults to "uploads" if unset)
	uploadDir := h.uploadDir
	if uploadDir == "" {
		uploadDir = "uploads"
	}
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "تعذر إنشاء مجلد حفظ الصور"})
		return
	}

	// Generate a collision-free UUID filename
	filename := fmt.Sprintf("%s%s", uuid.New().String(), ext)
	dst := filepath.Join(uploadDir, filename)

	if err := c.SaveUploadedFile(file, dst); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل حفظ الصورة على القرص"})
		return
	}

	// Return the relative URL served by r.Static("/uploads", uploadDir)
	c.JSON(http.StatusOK, gin.H{
		"url":      fmt.Sprintf("/uploads/%s", filename),
		"filename": filename,
	})
}
