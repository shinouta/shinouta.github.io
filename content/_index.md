---
# Leave the homepage title empty to use the site title
title: Sota Yoshino
date: 2025-03-17
type: landing

design:
  # Default section spacing
  spacing: "6rem"

sections:
  - block: resume-biography-3
    content:
      # Choose a user profile to display (a folder name within `content/authors/`)
      username: admin
      text: ""
      # Show a call-to-action button under your biography? (optional)
      # button:
        # text: Download CV
        # url: uploads/resume.pdf
    design:
      css_class: dark
      background:
        color: black
        image:
          # Add your image background to `assets/media/`.
          filename: stacked-peaks.svg
          filters:
            brightness: 1.0
          size: cover
          position: center
          parallax: false

  - block: collection
    id: papers
    content:
      title: Papers
      filters:
        folders:
          - publication
        featured_only: false
    design:
      view: citation
  # - block: collection
  #   id: news
  #   content:
  #     title: News
  #     filters:
  #       folders:
  #         - event
  #         - post
  #   design:
  #     view: article-grid
  #     columns: 3
---
