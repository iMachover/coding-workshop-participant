"""Request and response models for departments (ADMIN.md §2 "Departments")."""

from pydantic import BaseModel, Field


class DepartmentCreate(BaseModel):
    """Admin creates a department: a unique name and a unique 3-letter code prefix."""

    name: str = Field(min_length=1, max_length=100)
    prefix: str = Field(min_length=3, max_length=3)


class DepartmentUpdate(BaseModel):
    """Admin renames a department or changes its prefix (existing project codes keep theirs)."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    prefix: str | None = Field(default=None, min_length=3, max_length=3)


class Department(BaseModel):
    """A department with how much it owns."""

    id: int
    name: str
    prefix: str
    next_project_seq: int
    people: int
    active_projects: int
