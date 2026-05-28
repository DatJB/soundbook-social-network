package com.soundbook.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class DatabaseMigrationRunner implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) {
        try {
            log.info("Running custom database migrations...");
            jdbcTemplate.execute("ALTER TABLE room_members MODIFY COLUMN role ENUM('HOST','MEMBER','PENDING') NOT NULL DEFAULT 'MEMBER'");
            log.info("Successfully updated room_members role ENUM.");
        } catch (Exception e) {
            log.warn("Migration for room_members failed (maybe already applied or table doesn't exist yet): {}", e.getMessage());
        }
    }
}
